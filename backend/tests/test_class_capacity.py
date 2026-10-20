import unittest
from contextlib import ExitStack
from datetime import date, time
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from api.routes import classes, replacements
from core.permissions import get_current_user
from db import get_db
from schemas.scheduling import AssignReplacementPayload, ClassCreate, ClassUpdate
from services.class_assignments import ensure_class_capacity_column, reserved_temporary_teacher_count


class ClassCapacityTests(unittest.TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.db.execute.return_value.mappings.return_value.first.return_value = {
            "start_time": time(8), "end_time": time(9), "max_teachers": 2,
        }
        self.user = SimpleNamespace(role="manager")
        app = FastAPI()
        app.include_router(classes.router)
        app.dependency_overrides[get_current_user] = lambda: self.user
        app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.stack.enter_context(patch.object(classes, "ensure_class_teachers_table"))
        self.stack.enter_context(patch.object(classes, "ensure_class_teacher_reassignment_overrides_table"))
        self.count = self.stack.enter_context(patch.object(classes, "class_teacher_count", return_value=1))
        self.reserved = self.stack.enter_context(patch.object(classes, "reserved_temporary_teacher_count", return_value=0))

    def test_defaults_and_strict_positive_integer_validation(self):
        base = dict(day_of_week="T2", center_id="CS1", start_time="08:00", end_time="09:00")
        self.assertEqual(ClassCreate(**base).max_teachers, 2)
        self.assertEqual(ClassUpdate().model_dump(exclude_unset=True), {})
        for value in [0, -1, 1.5, True, "3", None, 2147483648]:
            for model, args in [(ClassUpdate, {}), (ClassCreate, base)]:
                with self.subTest(model=model, value=value), self.assertRaises(ValidationError):
                    model(**args, max_teachers=value)

    def test_update_persists_only_capacity_under_class_lock(self):
        response = self.client.put("/classes/C1", json={"max_teachers": 4})
        self.assertEqual(response.status_code, 200, response.text)
        queries = self.db.execute.call_args_list
        self.assertIn("FOR UPDATE", str(queries[0].args[0]))
        update = next(call for call in queries if "UPDATE classes SET" in str(call.args[0]))
        self.assertEqual(update.args[1], {"class_id": "C1", "max_teachers": 4})
        self.assertNotIn("teacher_id =", str(update.args[0]))
        self.db.commit.assert_called_once()

    def test_cannot_reduce_below_permanent_and_reserved_temporary_assignments(self):
        for assigned, reserved in [(3, 0), (1, 2)]:
            self.db.reset_mock()
            self.count.return_value, self.reserved.return_value = assigned, reserved
            response = self.client.put("/classes/C1", json={"max_teachers": 2})
            self.assertEqual(response.status_code, 400, response.text)
            self.assertIn("remove assigned teachers", response.json()["detail"])
            self.assertTrue(all("UPDATE classes" not in str(call.args[0]) for call in self.db.execute.call_args_list))
            self.db.commit.assert_not_called()
        self.count.return_value, self.reserved.return_value = 1, 1
        self.assertEqual(self.client.put("/classes/C1", json={"max_teachers": 2}).status_code, 200)

    def test_time_only_updates_do_not_reset_teacher_limit(self):
        response = self.client.put("/classes/C1", json={"start_time": "08:15"})
        self.assertEqual(response.status_code, 200, response.text)
        self.count.assert_not_called()
        query, params = self.db.execute.call_args.args
        self.assertNotIn("max_teachers", params)
        self.assertNotIn("max_teachers =", str(query))

    def test_create_and_list_return_the_class_capacity(self):
        with patch.object(classes, "generate_class_id", return_value="C1"):
            response = self.client.post("/classes", json={
                "day_of_week": "T2", "center_id": "CS1", "start_time": "08:00", "end_time": "09:00", "max_teachers": 3,
            })
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["max_teachers"], 3)
        insert = next(call for call in self.db.execute.call_args_list if "INSERT INTO classes" in str(call.args[0]))
        self.assertEqual(insert.args[1]["max_teachers"], 3)
        self.db.execute.return_value.mappings.return_value.all.return_value = [{"class_id": "C1", "max_teachers": 3}]
        response = self.client.get("/classes")
        self.assertEqual(response.json()[0]["max_teachers"], 3)
        self.assertIn("c.max_teachers", str(self.db.execute.call_args.args[0]))

    def test_teacher_cannot_edit_and_invalid_requests_do_not_write(self):
        for value in [0, 1.5, None]:
            self.assertEqual(self.client.put("/classes/C1", json={"max_teachers": value}).status_code, 422)
        self.user.role = "teacher"
        self.assertEqual(self.client.put("/classes/C1", json={"max_teachers": 4}).status_code, 403)
        self.db.execute.assert_not_called()

    def test_full_class_still_allows_replacement_suggestions(self):
        self.count.return_value = 3
        target = {"class_id": "C1", "max_teachers": 3, "center_id": "CS1",
                  "day_of_week": "T2", "start_time": time(8), "end_time": time(9)}
        with patch.object(replacements, "ensure_class_teachers_table"), \
             patch.object(replacements, "ensure_class_teacher_reassignment_overrides_table"), \
             patch.object(replacements, "class_teacher_count", return_value=3):
            self.db.execute.return_value.mappings.return_value.first.side_effect = [
                target, {"min_elo": 0, "max_elo": 1}, {"min_education_score": 0, "max_education_score": 1},
            ]
            self.db.execute.return_value.mappings.return_value.all.return_value = []
            self.assertEqual(replacements.get_replacement_suggestions("C1", "T1", self.db, self.user), [])
            self.assertGreater(self.db.execute.call_count, 1)
            self.db.reset_mock()
            self.db.execute.return_value.mappings.return_value.first.side_effect = [target]
            self.assertEqual(replacements.get_replacement_suggestions("C1", None, self.db, self.user), [])
            self.db.execute.assert_called_once()


class AssignmentCapacityTests(unittest.TestCase):
    def test_custom_limit_applies_to_permanent_and_temporary_additions(self):
        for mode, limit, assigned, reserved, blocked in [
            ("PERMANENT", 1, 1, 0, True), ("PERMANENT", 3, 2, 0, False),
            ("PERMANENT", 3, 3, 0, True), ("PERMANENT", 4, 1, 3, True),
            ("TEMPORARY", 3, 2, 0, False), ("TEMPORARY", 3, 1, 2, True),
        ]:
            with self.subTest(mode=mode, limit=limit, assigned=assigned, reserved=reserved), ExitStack() as stack:
                db = MagicMock()
                db.execute.return_value.first.return_value = None
                db.execute.return_value.scalar_one.return_value = reserved if mode == "TEMPORARY" else 0
                db.execute.return_value.mappings.return_value.first.side_effect = [
                    {"class_id": "C1", "day_of_week": "T7", "center_id": "CS1", "start_time": time(8),
                     "end_time": time(9), "status": "ASSIGNED", "max_teachers": limit},
                    {"teacher_id": "T9", "name": "Teacher", "active": True, "max_slots_per_day": 10},
                ]
                for name in ("ensure_class_teachers_table", "ensure_class_teacher_reassignment_overrides_table"):
                    stack.enter_context(patch.object(replacements, name))
                stack.enter_context(patch.object(replacements, "class_teacher_count", return_value=assigned))
                stack.enter_context(patch.object(replacements, "reserved_temporary_teacher_count", return_value=reserved))
                stack.enter_context(patch.object(replacements, "temporary_teaching_date", return_value=date(2026, 10, 24)))
                payload = AssignReplacementPayload(teacher_id="T9", mode=mode)
                if blocked:
                    with self.assertRaises(HTTPException) as caught:
                        replacements.assign_replacement("C1", payload, db, SimpleNamespace(user_code="M1"))
                    self.assertEqual(caught.exception.detail, "class has reached its teacher limit")
                    self.assertTrue(all("INSERT" not in str(call.args[0]) for call in db.execute.call_args_list))
                    db.commit.assert_not_called()
                else:
                    replacements.assign_replacement("C1", payload, db, SimpleNamespace(user_code="M1"))
                    self.assertTrue(any("INSERT" in str(call.args[0]) for call in db.execute.call_args_list))
                    db.commit.assert_called_once()
                self.assertIn("FOR UPDATE", str(db.execute.call_args_list[0].args[0]))

    def test_migration_default_and_reservations_are_scoped(self):
        db = MagicMock()
        ensure_class_capacity_column(db)
        sql = str(db.execute.call_args.args[0])
        self.assertIn("IF NOT EXISTS max_teachers", sql)
        self.assertIn("DEFAULT 2", sql)
        self.assertIn("CHECK (max_teachers > 0)", sql)
        db.commit.assert_called_once()
        db.execute.return_value.scalar_one.return_value = 2
        self.assertEqual(reserved_temporary_teacher_count(db, "C1"), 2)
        sql, params = db.execute.call_args.args
        self.assertEqual(params, {"class_id": "C1"})
        self.assertIn("original_teacher_id = replacement_teacher_id", str(sql))
        self.assertIn("expires_on >=", str(sql))
        self.assertIn("MAX(n)", str(sql))

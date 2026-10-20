import unittest
from datetime import date
from fastapi import HTTPException
from api.routes.replacements import temporary_teaching_date
from api.routes import replacements
from schemas.scheduling import AssignReplacementPayload
from types import SimpleNamespace
from unittest.mock import MagicMock, patch


class TemporaryDatesTests(unittest.TestCase):
    def test_suggestion_temporary_assignment_does_not_create_permanent_row(self):
        db = MagicMock()
        db.execute.return_value.mappings.return_value.first.side_effect = [
            {"class_id": "C1", "day_of_week": "T7", "center_id": "CS1", "start_time": "08:00", "end_time": "09:30", "status": "OPEN", "max_teachers": 2},
            {"teacher_id": "T2", "name": "Teacher", "active": True, "max_slots_per_day": 4},
        ]
        db.execute.return_value.first.return_value = None
        db.execute.return_value.scalar_one.return_value = 0
        day = date(2026, 10, 24)
        with patch.object(replacements, "ensure_class_teachers_table"), patch.object(replacements, "ensure_class_teacher_reassignment_overrides_table"), patch.object(replacements, "class_teacher_count", return_value=0), patch.object(replacements, "temporary_teaching_date", return_value=day):
            result = replacements.assign_replacement("C1", AssignReplacementPayload(teacher_id="T2", mode="TEMPORARY", effective_date=day), db, SimpleNamespace(user_code="0000000"))
        self.assertEqual(result["effective_date"], day)
        statements = [str(call.args[0]) for call in db.execute.call_args_list]
        self.assertTrue(any("INSERT INTO class_teacher_reassignment_overrides" in sql for sql in statements))
        self.assertFalse(any("INSERT INTO class_teachers " in sql for sql in statements))
        db.commit.assert_called_once()

    def test_temporary_save_preserves_permanent_teacher_and_expires_on_teaching_day(self):
        db = MagicMock()
        db.execute.return_value.first.side_effect = [(1,), None, None, None]
        db.execute.return_value.mappings.return_value.first.side_effect = [
            {"class_id": "C1", "day_of_week": "T7", "center_id": "CS1", "start_time": "08:00", "end_time": "09:30", "status": "ASSIGNED"},
            {"teacher_id": "T2", "name": "Teacher", "active": True, "max_slots_per_day": 4},
        ]
        db.execute.return_value.scalar_one.return_value = 0
        day = date(2026, 10, 24)
        with patch.object(replacements, "ensure_class_teachers_table"), patch.object(replacements, "ensure_class_teacher_reassignment_overrides_table"), patch.object(replacements, "update_class_assignment_state"), patch.object(replacements, "temporary_teaching_date", return_value=day):
            result = replacements.reassign_class_teacher("C1", "T1", AssignReplacementPayload(teacher_id="T2", mode="TEMPORARY", effective_date=day), db, SimpleNamespace(user_code="0000000"))
        self.assertEqual(result["effective_date"], day)
        inserts = [call for call in db.execute.call_args_list if "INSERT INTO class_teacher_reassignment_overrides" in str(call.args[0])]
        self.assertEqual(len(inserts), 1)
        self.assertEqual(inserts[0].args[1]["effective_date"], day)
        self.assertEqual(str(inserts[0].args[0]).count(":effective_date"), 2)
        self.assertFalse(any("DELETE FROM class_teachers" in str(call.args[0]) for call in db.execute.call_args_list))

    def test_next_teaching_day_not_action_day(self):
        for today in (date(2026, 10, 20), date(2026, 10, 21)):
            self.assertEqual(temporary_teaching_date("T7", today=today), date(2026, 10, 24))

    def test_today_and_next_week(self):
        self.assertEqual(temporary_teaching_date("T7", today=date(2026, 10, 24)), date(2026, 10, 24))
        self.assertEqual(temporary_teaching_date("T7", date(2026, 10, 31), date(2026, 10, 20)), date(2026, 10, 31))
        self.assertEqual(temporary_teaching_date("T7", today=date(2026, 10, 25)), date(2026, 10, 31))

    def test_wrong_weekday_and_past_date_rejected(self):
        for requested in (date(2026, 10, 17), date(2026, 10, 23)):
            with self.assertRaises(HTTPException):
                temporary_teaching_date("T7", requested, date(2026, 10, 20))

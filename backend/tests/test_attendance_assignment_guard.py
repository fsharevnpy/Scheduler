import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from api.routes import attendance
from core.permissions import get_current_user
from db import get_db


class AssignmentGuardTests(unittest.TestCase):
    def test_http_unmatched_checkin_is_rejected_without_insert_or_commit(self):
        for teacher_id in ("GV-test", None):
            with self.subTest(teacher_id=teacher_id):
                db = MagicMock()
                db.execute.return_value.mappings.return_value.first.return_value = None
                user = SimpleNamespace(user_code="TC00001", teacher_id=teacher_id, role="teacher", display_name="Teacher")
                app = FastAPI()
                app.include_router(attendance.router)
                app.dependency_overrides[get_current_user] = lambda: user
                app.dependency_overrides[get_db] = lambda: db
                with TestClient(app) as client, \
                     patch.object(attendance, "ensure_attendance_table"), \
                     patch.object(attendance, "ensure_assignment_tables"), \
                     patch.object(attendance, "get_closest_center", return_value={"center_id": "CS1"}):
                    response = client.post("/attendance-records/check-in", json={
                        "latitude": 10.77, "longitude": 106.69, "accuracy_meters": 8,
                    })
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["detail"], "no assigned teaching session available for attendance")
                db.commit.assert_not_called()
                self.assertTrue(all("INSERT" not in str(call.args[0]) for call in db.execute.call_args_list))
                if teacher_id:
                    query, params = db.execute.call_args.args
                    self.assertEqual(params["teacher_id"], teacher_id)
                    self.assertEqual(params["center_id"], "CS1")
                    self.assertIn("JOIN assigned_classes", str(query))

    def test_http_matched_checkin_still_saves(self):
        db = MagicMock()
        user = SimpleNamespace(user_code="TC00001", teacher_id="T1", role="teacher", display_name="Teacher")
        record = {"record_id": "in1", "teacher_id": "T1", "class_id": "C1", "event_type": "CHECK_IN"}
        db.execute.return_value.mappings.return_value.first.side_effect = [
            None, {"class_id": "C1", "attendance_status": "ON_TIME"}, record,
        ]
        app = FastAPI()
        app.include_router(attendance.router)
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_db] = lambda: db
        with TestClient(app) as client, \
             patch.object(attendance, "ensure_attendance_table"), \
             patch.object(attendance, "ensure_assignment_tables"), \
             patch.object(attendance, "get_closest_center", return_value={"center_id": "CS1", "name": "Center", "status": "VALID"}), \
             patch.object(attendance, "snapshot_attendance_session", return_value=record):
            response = client.post("/attendance-records/check-in", json={"latitude": 10.77, "longitude": 106.69})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["class_id"], "C1")
        db.commit.assert_called_once()
        inserts = [call for call in db.execute.call_args_list if "INSERT" in str(call.args[0])]
        self.assertEqual(len(inserts), 1)

    def test_unassigned_teacher_cannot_insert_checkin_or_checkout(self):
        for action in (attendance.check_in_attendance, attendance.check_out_attendance):
            db = MagicMock()
            db.execute.return_value.mappings.return_value.first.return_value = None
            user = SimpleNamespace(user_code="test", teacher_id="GV-test")
            payload = SimpleNamespace(latitude=10, longitude=106, accuracy_meters=5)
            unmatched = {"class_id": None, "attendance_status": "UNMATCHED"}
            with patch.object(attendance, "ensure_attendance_table"), patch.object(attendance, "ensure_assignment_tables"), \
                 patch.object(attendance, "get_closest_center", return_value={"center_id": "CS1"}), \
                 patch.object(attendance, "find_matching_class_session", return_value=unmatched), \
                 patch.object(attendance, "find_open_check_in", return_value={"class_id": None}), \
                 patch.object(attendance, "resolve_checkout_session", return_value=unmatched):
                with self.assertRaises(HTTPException) as error:
                    action(payload, user, db)
            self.assertEqual(error.exception.status_code, 400)
            self.assertIn("no assigned teaching session", error.exception.detail)
            db.commit.assert_not_called()
            self.assertTrue(all("INSERT" not in str(call.args[0]) for call in db.execute.call_args_list))

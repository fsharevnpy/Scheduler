import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from api.routes import attendance


class AssignmentGuardTests(unittest.TestCase):
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

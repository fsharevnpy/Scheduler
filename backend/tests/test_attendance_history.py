import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import UUID

from fastapi import HTTPException
from api.routes.attendance import get_attendance_records, snapshot_attendance_session


class AttendanceHistoryTests(unittest.TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.db.execute.return_value.mappings.return_value.all.return_value = []
        self.user = SimpleNamespace(role="teacher", user_code="TC00001")

    def fetch(self, **kwargs):
        options = dict(limit=500, before_checked_at=None, before_record_id=None)
        options.update(kwargs)
        with patch("api.routes.attendance.ensure_attendance_table"):
            return get_attendance_records(current_user=self.user, db=self.db, **options)

    def test_teacher_scope_and_stable_cursor_are_both_applied(self):
        timestamp = datetime(2026, 10, 19, 2, tzinfo=timezone.utc)
        record_id = UUID("00000000-0000-0000-0000-000000000500")
        self.fetch(before_checked_at=timestamp, before_record_id=record_id)
        query, params = self.db.execute.call_args.args
        self.assertIn("ar.user_code = :user_code", str(query))
        self.assertIn("(ar.checked_at, ar.record_id) <", str(query))
        self.assertIn("ORDER BY ar.checked_at DESC, ar.record_id DESC LIMIT :limit", str(query))
        self.assertEqual(params["user_code"], "TC00001")
        self.assertEqual(params["before_checked_at"], timestamp)
        self.assertEqual(params["before_record_id"], str(record_id))
        self.assertEqual(params["limit"], 500)

    def test_manager_can_page_all_users(self):
        self.user.role = "manager"
        self.fetch()
        query, params = self.db.execute.call_args.args
        self.assertNotIn("ar.user_code = :user_code", str(query))
        self.assertNotIn("user_code", params)
        self.assertIn("ar.session_start_time", str(query))

    def test_incomplete_or_naive_cursor_is_rejected(self):
        for params in [
            {"before_record_id": UUID(int=1)},
            {"before_checked_at": datetime.now(timezone.utc)},
            {"before_checked_at": datetime(2026, 10, 19), "before_record_id": UUID(int=1)},
        ]:
            with self.subTest(params=params), self.assertRaises(HTTPException) as error:
                self.fetch(**params)
            self.assertEqual(error.exception.status_code, 400)
        self.db.execute.assert_not_called()

    def test_snapshot_captures_only_the_new_record(self):
        snapshot = {
            "session_class_id": "C1", "session_center_id": "CS1",
            "session_start_time": "09:00:00", "session_end_time": "10:00:00",
        }
        self.db.execute.return_value.mappings.return_value.one.return_value = snapshot
        record = {"record_id": UUID(int=1), "class_id": "C1"}
        result = snapshot_attendance_session(self.db, record)
        query, params = self.db.execute.call_args.args
        self.assertIn("ar.record_id = :record_id", str(query))
        self.assertEqual(params["record_id"], record["record_id"])
        self.assertEqual(result, {**record, **snapshot})

    def test_unmatched_event_is_not_assigned_a_fabricated_snapshot(self):
        record = {"record_id": UUID(int=1), "class_id": None}
        self.assertEqual(snapshot_attendance_session(self.db, record), record)
        self.db.execute.assert_not_called()


if __name__ == "__main__":
    unittest.main()

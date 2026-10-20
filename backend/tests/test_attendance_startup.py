import io
import tarfile
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

import main
from api.routes import admin, attendance


class AttendanceStartupTests(unittest.TestCase):
    def test_schema_is_initialized_once_before_serving(self):
        with patch.object(main, "SessionLocal") as session, \
             patch.object(main, "ensure_attendance_table") as initialize, \
             patch.object(main, "ensure_class_capacity_column") as initialize_capacity:
            with TestClient(main.app) as client:
                initialize.assert_called_once_with(session.return_value.__enter__.return_value)
                client.get("/openapi.json")
                client.get("/openapi.json")
                initialize.assert_called_once()
                initialize_capacity.assert_called_once_with(session.return_value.__enter__.return_value)
            session.return_value.__exit__.assert_called_once()

    def test_capacity_schema_failure_prevents_serving(self):
        with patch.object(main, "SessionLocal"), \
             patch.object(main, "ensure_attendance_table"), \
             patch.object(main, "ensure_class_capacity_column", side_effect=RuntimeError("capacity migration failed")):
            with self.assertRaisesRegex(RuntimeError, "capacity migration failed"):
                with TestClient(main.app):
                    self.fail("Server must not start with an incomplete capacity schema")

    def test_schema_failure_prevents_serving(self):
        with patch.object(main, "SessionLocal"), \
             patch.object(main, "ensure_attendance_table", side_effect=RuntimeError("migration failed")):
            with self.assertRaisesRegex(RuntimeError, "migration failed"):
                with TestClient(main.app):
                    self.fail("Server must not start with an incomplete attendance schema")

    def test_migration_preserves_backfill_and_adds_cursor_indexes(self):
        db = MagicMock()
        attendance.ensure_attendance_table(db)
        queries = [str(call.args[0]) for call in db.execute.call_args_list]
        self.assertTrue(any("WHERE status = 'NON_VALID'" in query for query in queries))
        self.assertTrue(any("ON attendance_records(checked_at DESC, record_id DESC)" in query for query in queries))
        self.assertTrue(any("ON attendance_records(user_code, checked_at DESC, record_id DESC)" in query for query in queries))
        db.commit.assert_called_once()


class AttendanceRestoreTests(unittest.IsolatedAsyncioTestCase):
    async def test_full_restore_reapplies_schema_and_surfaces_failure(self):
        for failure in (None, RuntimeError("migration failed")):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                archive = root / "scheduler_backup_test.tar.gz"
                content = b"SELECT 1;"
                with tarfile.open(archive, "w:gz") as tar:
                    entry = tarfile.TarInfo("database.sql")
                    entry.size = len(content)
                    tar.addfile(entry, io.BytesIO(content))
                db = MagicMock()
                with patch.object(admin, "BACKUP_DIR", root), \
                     patch.object(admin, "ensure_attendance_table", side_effect=failure) as initialize, \
                     patch.object(admin, "ensure_class_capacity_column") as initialize_capacity:
                    if failure:
                        with self.assertRaises(HTTPException) as caught:
                            await admin.restore_full_backup(archive.name, SimpleNamespace(role="developer"), db)
                        self.assertEqual(caught.exception.status_code, 500)
                        self.assertIn("migration failed", caught.exception.detail)
                    else:
                        result = await admin.restore_full_backup(archive.name, SimpleNamespace(role="developer"), db)
                        self.assertEqual(result["status"], "success")
                        initialize_capacity.assert_called_once_with(db)
                    initialize.assert_called_once_with(db)
                    self.assertGreaterEqual(db.commit.call_count, 2)

import os
import subprocess
import tarfile
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from starlette.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.permissions import ROLE_DEVELOPER, require_roles
from db import get_db
from schemas.auth import CurrentUser
from api.routes.attendance import ensure_attendance_table
from services.class_assignments import ensure_class_capacity_column

router = APIRouter(prefix="/admin", tags=["admin"])

BACKUP_DIR = Path("/backup")
BACKUP_SCRIPT = Path("/app/scripts/backup.sh")
DB_USER = os.getenv("POSTGRES_USER", "chessfighter")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "123456")
DB_HOST = os.getenv("DB_HOST", "db")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("POSTGRES_DB", "scheduler")


@router.post("/backup")
async def trigger_backup(current_user: CurrentUser = Depends(require_roles(ROLE_DEVELOPER))):
    """Trigger manual backup of database and MinIO"""
    try:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")

        if not BACKUP_SCRIPT.exists():
            raise HTTPException(status_code=500, detail=f"Backup script not found: {BACKUP_SCRIPT}")

        # Run backup script
        result = subprocess.run(
            ["/bin/bash", str(BACKUP_SCRIPT), str(BACKUP_DIR)],
            capture_output=True,
            text=True,
            timeout=300,
        )

        if result.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"Backup failed: {result.stderr}"
            )

        # Get actual backup file (most recent)
        backup_files = sorted(BACKUP_DIR.glob("scheduler_backup_*.tar.gz"))
        if not backup_files:
            raise HTTPException(status_code=500, detail="Backup file not found")

        actual_backup = backup_files[-1]
        size_mb = actual_backup.stat().st_size / (1024 * 1024)

        return {
            "status": "success",
            "file": actual_backup.name,
            "size_mb": round(size_mb, 2),
            "timestamp": timestamp
        }
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="Backup timeout")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/backups")
async def list_backups(current_user: CurrentUser = Depends(require_roles(ROLE_DEVELOPER))):
    """List all backup files"""
    try:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        backups = sorted(BACKUP_DIR.glob("scheduler_backup_*.tar.gz"), reverse=True)

        return {
            "status": "success",
            "count": len(backups),
            "backups": [
                {
                    "file": b.name,
                    "size_mb": round(b.stat().st_size / (1024 * 1024), 2),
                    "created": datetime.fromtimestamp(b.stat().st_mtime).isoformat(),
                }
                for b in backups
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/backups/{filename}/restore-full")
async def restore_full_backup(filename: str, current_user: CurrentUser = Depends(require_roles(ROLE_DEVELOPER)), db: Session = Depends(get_db)):
    """Restore entire database from backup file"""
    try:
        backup_path = BACKUP_DIR / filename

        if not backup_path.exists():
            raise HTTPException(status_code=404, detail="Backup file not found")

        if not filename.startswith("scheduler_backup_") or not filename.endswith(".tar.gz"):
            raise HTTPException(status_code=400, detail="Invalid backup filename")

        # Extract backup
        extract_dir = BACKUP_DIR / f"restore_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        extract_dir.mkdir(exist_ok=True)

        with tarfile.open(backup_path, "r:gz") as tar:
            tar.extractall(extract_dir)

        # Restore database
        db_file = extract_dir / "database.sql"
        if not db_file.exists():
            raise HTTPException(status_code=400, detail="Database file not found in backup")

        # Kill existing connections to scheduler DB
        db.execute(text("""
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = 'scheduler' AND pid <> pg_backend_pid()
        """))
        db.commit()

        # Restore
        with open(db_file) as f:
            sql_content = f.read()

        # Split and execute (to handle large files)
        for statement in sql_content.split(';'):
            statement = statement.strip()
            if statement:
                try:
                    db.execute(text(statement))
                except Exception as e:
                    # Some statements might fail (like CREATE DATABASE), continue
                    pass

        db.commit()

        ensure_attendance_table(db)
        ensure_class_capacity_column(db)

        # Cleanup
        import shutil
        shutil.rmtree(extract_dir, ignore_errors=True)

        return {
            "status": "success",
            "message": f"Full database restored from {filename}"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/backups/{filename}/restore-master")
async def restore_master_data(filename: str, current_user: CurrentUser = Depends(require_roles(ROLE_DEVELOPER)), db: Session = Depends(get_db)):
    """Restore only master data (centers, teachers, preferences)"""
    try:
        backup_path = BACKUP_DIR / filename

        if not backup_path.exists():
            raise HTTPException(status_code=404, detail="Backup file not found")

        if not filename.startswith("scheduler_backup_") or not filename.endswith(".tar.gz"):
            raise HTTPException(status_code=400, detail="Invalid backup filename")

        # Extract backup
        extract_dir = BACKUP_DIR / f"restore_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        extract_dir.mkdir(exist_ok=True)

        with tarfile.open(backup_path, "r:gz") as tar:
            tar.extractall(extract_dir)

        db_file = extract_dir / "database.sql"
        if not db_file.exists():
            raise HTTPException(status_code=400, detail="Database file not found in backup")

        # Read backup SQL and extract master data
        with open(db_file) as f:
            backup_sql = f.read()

        # Clear existing master data
        db.execute(text("DELETE FROM teacher_preferences"))
        db.execute(text("DELETE FROM teachers"))
        db.execute(text("DELETE FROM center_slots"))
        db.execute(text("DELETE FROM centers"))
        db.commit()

        # Extract and execute INSERT statements for master tables
        lines = backup_sql.split('\n')
        in_insert = False
        current_insert = ""

        for line in lines:
            if line.strip().startswith("INSERT INTO centers") or \
               line.strip().startswith("INSERT INTO center_slots") or \
               line.strip().startswith("INSERT INTO teachers") or \
               line.strip().startswith("INSERT INTO teacher_preferences"):
                in_insert = True
                current_insert = line
            elif in_insert:
                current_insert += "\n" + line
                if line.strip().endswith(";"):
                    in_insert = False
                    try:
                        db.execute(text(current_insert))
                    except Exception:
                        pass
                    current_insert = ""

        db.commit()

        # Cleanup
        import shutil
        shutil.rmtree(extract_dir, ignore_errors=True)

        return {
            "status": "success",
            "message": f"Master data restored from {filename}"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/backups/{filename}/download")
async def download_backup(filename: str, current_user: CurrentUser = Depends(require_roles(ROLE_DEVELOPER))):
    """Download backup file"""
    try:
        backup_path = BACKUP_DIR / filename

        if not backup_path.exists():
            raise HTTPException(status_code=404, detail="Backup file not found")

        if not filename.startswith("scheduler_backup_") or not filename.endswith(".tar.gz"):
            raise HTTPException(status_code=400, detail="Invalid backup filename")

        return FileResponse(
            backup_path,
            media_type="application/gzip",
            filename=filename
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/backups/{filename}")
async def delete_backup(filename: str, current_user: CurrentUser = Depends(require_roles(ROLE_DEVELOPER))):
    """Delete backup file"""
    try:
        backup_path = BACKUP_DIR / filename

        if not backup_path.exists():
            raise HTTPException(status_code=404, detail="Backup file not found")

        if not filename.startswith("scheduler_backup_") or not filename.endswith(".tar.gz"):
            raise HTTPException(status_code=400, detail="Invalid backup filename")

        backup_path.unlink()

        return {
            "status": "success",
            "message": f"Backup file {filename} deleted"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

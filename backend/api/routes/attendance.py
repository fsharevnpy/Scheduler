from math import atan2, cos, radians, sin, sqrt
from uuid import uuid4

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.permissions import (
    ROLE_DEVELOPER,
    ROLE_MANAGER,
    ROLE_TEACHER,
    get_current_user,
    require_roles,
)
from db import get_db
from schemas.auth import CurrentUser
from schemas.scheduling import AttendanceCheckInPayload


router = APIRouter()


def ensure_attendance_table(db: Session) -> None:
    db.execute(
        text("""
            CREATE TABLE IF NOT EXISTS attendance_records (
                record_id UUID PRIMARY KEY,
                user_code VARCHAR(7) NOT NULL REFERENCES users(user_code) ON DELETE CASCADE,
                teacher_id VARCHAR(20) REFERENCES teachers(teacher_id) ON DELETE SET NULL,
                checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                latitude NUMERIC(9,6) NOT NULL,
                longitude NUMERIC(9,6) NOT NULL,
                accuracy_meters NUMERIC(10,2),
                status VARCHAR(10) NOT NULL DEFAULT 'INVALID'
            )
        """)
    )
    db.execute(
        text("""
            ALTER TABLE attendance_records
            ADD COLUMN IF NOT EXISTS status VARCHAR(10) NOT NULL DEFAULT 'INVALID'
        """)
    )
    db.execute(
        text("""
            UPDATE attendance_records
            SET status = 'INVALID'
            WHERE status = 'NON_VALID'
        """),
    )
    db.execute(
        text("""
            CREATE INDEX IF NOT EXISTS idx_attendance_records_user_time
                ON attendance_records(user_code, checked_at DESC)
        """)
    )
    db.execute(
        text("""
            CREATE INDEX IF NOT EXISTS idx_attendance_records_teacher_time
                ON attendance_records(teacher_id, checked_at DESC)
        """)
    )
    db.commit()


@router.get("/attendance-records")
def get_attendance_records(
    current_user: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER, ROLE_TEACHER)),
    db: Session = Depends(get_db),
):
    ensure_attendance_table(db)

    params = {}
    query = """
        SELECT
            ar.record_id,
            ar.user_code,
            u.display_name,
            ar.teacher_id,
            ar.checked_at,
            ar.latitude,
            ar.longitude,
            ar.accuracy_meters,
            ar.status,
            ar.nearest_center_name
        FROM attendance_records ar
        JOIN users u ON u.user_code = ar.user_code
    """

    if current_user.role == ROLE_TEACHER:
        query += " WHERE ar.user_code = :user_code"
        params["user_code"] = current_user.user_code

    query += " ORDER BY ar.checked_at DESC LIMIT 200"

    records = db.execute(text(query), params).mappings().all()
    return [dict(item) for item in records]


@router.post("/attendance-records/check-in")
def check_in_attendance(
    payload: AttendanceCheckInPayload,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ensure_attendance_table(db)

    record_id = str(uuid4())
    centers = db.execute(text("SELECT center_id, name, latitude, longitude FROM centers")).mappings().all()

    def haversine_distance(lat1, lon1, lat2, lon2):
        r = 6371000.0
        dlat = radians(lat2 - lat1)
        dlon = radians(lon2 - lon1)
        a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
        c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return r * c

    closest_distance = None
    closest_center_name = None
    for center in centers:
        distance = haversine_distance(
            payload.latitude,
            payload.longitude,
            float(center["latitude"]),
            float(center["longitude"]),
        )
        if closest_distance is None or distance < closest_distance:
            closest_distance = distance
            closest_center_name = center.get("name")

    check_in_status = "VALID" if closest_distance is not None and closest_distance <= 200 else "INVALID"

    record = db.execute(
        text("""
            INSERT INTO attendance_records (
                record_id, user_code, teacher_id, latitude, longitude, accuracy_meters, status, nearest_center_name
            )
            VALUES (
                :record_id, :user_code, :teacher_id, :latitude, :longitude, :accuracy_meters, :status, :nearest_center_name
            )
            RETURNING
                record_id,
                user_code,
                teacher_id,
                checked_at,
                latitude,
                longitude,
                accuracy_meters,
                status,
                nearest_center_name
        """),
        {
            "record_id": record_id,
            "user_code": current_user.user_code,
            "teacher_id": current_user.teacher_id,
            "latitude": payload.latitude,
            "longitude": payload.longitude,
            "accuracy_meters": payload.accuracy_meters,
            "status": check_in_status,
            "nearest_center_name": closest_center_name,
        },
    ).mappings().first()
    db.commit()

    return {
        **dict(record),
        "display_name": current_user.display_name,
    }

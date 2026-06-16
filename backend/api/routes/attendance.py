from datetime import datetime, timezone
from math import atan2, cos, radians, sin, sqrt
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
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
from schemas.scheduling import AttendanceCheckInPayload, ManualAttendancePayload


router = APIRouter()
CHECK_IN_COOLDOWN_MINUTES = 5
LOCAL_TIMEZONE = "Asia/Ho_Chi_Minh"


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
                status VARCHAR(10) NOT NULL DEFAULT 'INVALID',
                nearest_center_name VARCHAR(100),
                class_id VARCHAR(20) REFERENCES classes(class_id) ON DELETE SET NULL,
                attendance_status VARCHAR(20) NOT NULL DEFAULT 'UNMATCHED'
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
            ALTER TABLE attendance_records
            ADD COLUMN IF NOT EXISTS nearest_center_name VARCHAR(100)
        """)
    )
    db.execute(
        text("""
            ALTER TABLE attendance_records
            ADD COLUMN IF NOT EXISTS class_id VARCHAR(20) REFERENCES classes(class_id) ON DELETE SET NULL
        """)
    )
    db.execute(
        text("""
            ALTER TABLE attendance_records
            ADD COLUMN IF NOT EXISTS attendance_status VARCHAR(20) NOT NULL DEFAULT 'UNMATCHED'
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


def find_matching_class_session(db: Session, teacher_id: str | None, center_id: str | None, checked_at: datetime):
    if not teacher_id:
        return {"class_id": None, "attendance_status": "UNMATCHED"}

    params = {
        "teacher_id": teacher_id,
        "center_id": center_id,
        "checked_at": checked_at,
    }
    center_filter = "AND c.center_id = :center_id" if center_id else ""

    session = db.execute(
        text(f"""
            WITH checked AS (
                SELECT
                    CAST(:checked_at AS TIMESTAMPTZ) AT TIME ZONE '{LOCAL_TIMEZONE}' AS local_checked_at
            ),
            assigned_classes AS (
                SELECT ct.class_id
                FROM class_teachers ct
                WHERE ct.teacher_id = :teacher_id
                UNION
                SELECT c.class_id
                FROM classes c
                WHERE c.teacher_id = :teacher_id
            )
            SELECT
                c.class_id,
                CASE
                    WHEN CAST(checked.local_checked_at AS TIME) < c.start_time - INTERVAL '30 minutes'
                        THEN 'EARLY'
                    WHEN CAST(checked.local_checked_at AS TIME) <= c.start_time
                        THEN 'ON_TIME'
                    WHEN CAST(checked.local_checked_at AS TIME) <= c.end_time
                        THEN 'LATE'
                    ELSE 'UNMATCHED'
                END AS attendance_status
            FROM classes c
            JOIN assigned_classes ac ON ac.class_id = c.class_id
            CROSS JOIN checked
            WHERE c.day_of_week = CASE EXTRACT(ISODOW FROM checked.local_checked_at)
                    WHEN 1 THEN 'T2'
                    WHEN 2 THEN 'T3'
                    WHEN 3 THEN 'T4'
                    WHEN 4 THEN 'T5'
                    WHEN 5 THEN 'T6'
                    WHEN 6 THEN 'T7'
                    ELSE 'CN'
                END
              {center_filter}
              AND CAST(checked.local_checked_at AS TIME) <= c.end_time
            ORDER BY
                CASE
                    WHEN CAST(checked.local_checked_at AS TIME) > c.start_time
                     AND CAST(checked.local_checked_at AS TIME) <= c.end_time THEN 1
                    ELSE 2
                END,
                c.start_time
            LIMIT 1
        """),
        params,
    ).mappings().first()

    if not session:
        return {"class_id": None, "attendance_status": "UNMATCHED"}

    return dict(session)


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
            ar.nearest_center_name,
            ar.class_id,
            ar.attendance_status
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

    recent_check_in = db.execute(
        text("""
            SELECT checked_at
            FROM attendance_records
            WHERE user_code = :user_code
              AND checked_at > NOW() - (:cooldown_minutes * INTERVAL '1 minute')
            ORDER BY checked_at DESC
            LIMIT 1
        """),
        {
            "user_code": current_user.user_code,
            "cooldown_minutes": CHECK_IN_COOLDOWN_MINUTES,
        },
    ).mappings().first()

    if recent_check_in:
        raise HTTPException(
            status_code=429,
            detail=f"please wait {CHECK_IN_COOLDOWN_MINUTES} minutes between check-ins",
        )

    record_id = str(uuid4())
    record_checked_at = datetime.now(timezone.utc)
    centers = db.execute(text("SELECT center_id, name, latitude, longitude FROM centers")).mappings().all()

    def haversine_distance(lat1, lon1, lat2, lon2):
        r = 6371000.0
        dlat = radians(lat2 - lat1)
        dlon = radians(lon2 - lon1)
        a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
        c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return r * c

    closest_distance = None
    closest_center_id = None
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
            closest_center_id = center.get("center_id")
            closest_center_name = center.get("name")

    check_in_status = "VALID" if closest_distance is not None and closest_distance <= 200 else "INVALID"
    session_match = find_matching_class_session(db, current_user.teacher_id, closest_center_id, record_checked_at)

    record = db.execute(
        text("""
            INSERT INTO attendance_records (
                record_id, user_code, teacher_id, checked_at, latitude, longitude, accuracy_meters,
                status, nearest_center_name, class_id, attendance_status
            )
            VALUES (
                :record_id, :user_code, :teacher_id, :checked_at, :latitude, :longitude, :accuracy_meters,
                :status, :nearest_center_name, :class_id, :attendance_status
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
                nearest_center_name,
                class_id,
                attendance_status
        """),
        {
            "record_id": record_id,
            "user_code": current_user.user_code,
            "teacher_id": current_user.teacher_id,
            "checked_at": record_checked_at,
            "latitude": payload.latitude,
            "longitude": payload.longitude,
            "accuracy_meters": payload.accuracy_meters,
            "status": check_in_status,
            "nearest_center_name": closest_center_name,
            "class_id": session_match["class_id"],
            "attendance_status": session_match["attendance_status"],
        },
    ).mappings().first()
    db.commit()

    return {
        **dict(record),
        "display_name": current_user.display_name,
    }


@router.post("/attendance-records/manual")
def create_manual_attendance(
    payload: ManualAttendancePayload,
    current_user: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
    db: Session = Depends(get_db),
):
    ensure_attendance_table(db)

    teacher = db.execute(
        text("""
            SELECT t.teacher_id, t.name, u.user_code, u.display_name
            FROM teachers t
            JOIN users u ON u.teacher_id = t.teacher_id AND u.role = 'teacher'
            WHERE t.teacher_id = :teacher_id
              AND t.active = TRUE
              AND u.active = TRUE
            LIMIT 1
        """),
        {"teacher_id": payload.teacher_id},
    ).mappings().first()

    if not teacher:
        raise HTTPException(status_code=404, detail="teacher not found")

    center = db.execute(
        text("""
            SELECT center_id, name, latitude, longitude
            FROM centers
            WHERE center_id = :center_id
            LIMIT 1
        """),
        {"center_id": payload.center_id},
    ).mappings().first()

    if not center:
        raise HTTPException(status_code=404, detail="center not found")

    record_id = str(uuid4())
    session_match = find_matching_class_session(db, teacher["teacher_id"], center["center_id"], payload.checked_at)
    record = db.execute(
        text("""
            INSERT INTO attendance_records (
                record_id,
                user_code,
                teacher_id,
                checked_at,
                latitude,
                longitude,
                accuracy_meters,
                status,
                nearest_center_name,
                class_id,
                attendance_status
            )
            VALUES (
                :record_id,
                :user_code,
                :teacher_id,
                :checked_at,
                :latitude,
                :longitude,
                NULL,
                'MANUAL',
                :nearest_center_name,
                :class_id,
                'MANUAL'
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
                nearest_center_name,
                class_id,
                attendance_status
        """),
        {
            "record_id": record_id,
            "user_code": teacher["user_code"],
            "teacher_id": teacher["teacher_id"],
            "checked_at": payload.checked_at,
            "latitude": center["latitude"],
            "longitude": center["longitude"],
            "nearest_center_name": center["name"],
            "class_id": session_match["class_id"],
        },
    ).mappings().first()
    db.commit()

    return {
        **dict(record),
        "display_name": teacher["display_name"],
    }

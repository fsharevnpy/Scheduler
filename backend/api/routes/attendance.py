from datetime import date, datetime, timedelta, timezone
import json
import re
from urllib.parse import quote
from typing import Literal
from math import atan2, cos, radians, sin, sqrt
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session
from starlette.responses import StreamingResponse

from core.permissions import (
    ROLE_DEVELOPER,
    ROLE_MANAGER,
    ROLE_TEACHER,
    get_current_user,
    require_roles,
)
from db import get_db
from schemas.auth import CurrentUser
from schemas.scheduling import AttendanceCheckInPayload, AttendanceCheckOutPayload, ManualAttendancePayload
from services.class_assignments import ensure_class_teacher_reassignment_overrides_table, ensure_class_teachers_table
from services.attendance_reports import build_attendance_report, build_report_workbook, local_datetime


router = APIRouter()
CHECK_IN_COOLDOWN_MINUTES = 5
CHECK_OUT_COOLDOWN_MINUTES = 5
LOCAL_TIMEZONE = "Asia/Ho_Chi_Minh"


EFFECTIVE_ASSIGNMENTS_FOR_CHECKED_AT_CTE = """
            active_teacher_overrides AS (
                SELECT override.class_id, override.original_teacher_id, override.replacement_teacher_id
                FROM class_teacher_reassignment_overrides override
                CROSS JOIN checked
                WHERE override.effective_date <= CAST(checked.local_checked_at AS DATE)
                  AND override.expires_on >= CAST(checked.local_checked_at AS DATE)
            ),
            effective_assignment_rows AS (
                SELECT
                    ct.class_id,
                    COALESCE(active_override.replacement_teacher_id, ct.teacher_id) AS teacher_id
                FROM class_teachers ct
                LEFT JOIN active_teacher_overrides active_override
                    ON active_override.class_id = ct.class_id
                   AND active_override.original_teacher_id = ct.teacher_id

                UNION

                SELECT
                    c.class_id,
                    COALESCE(active_override.replacement_teacher_id, c.teacher_id) AS teacher_id
                FROM classes c
                LEFT JOIN active_teacher_overrides active_override
                    ON active_override.class_id = c.class_id
                   AND active_override.original_teacher_id = c.teacher_id
                WHERE c.teacher_id IS NOT NULL
                UNION
                SELECT class_id, replacement_teacher_id FROM active_teacher_overrides
                WHERE original_teacher_id = replacement_teacher_id
            ),
            assigned_classes AS (
                SELECT DISTINCT class_id
                FROM effective_assignment_rows
                WHERE teacher_id = :teacher_id
            )
"""


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
                attendance_status VARCHAR(20) NOT NULL DEFAULT 'UNMATCHED',
                event_type VARCHAR(10) NOT NULL DEFAULT 'CHECK_IN'
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
            ALTER TABLE attendance_records
            ADD COLUMN IF NOT EXISTS event_type VARCHAR(10) NOT NULL DEFAULT 'CHECK_IN'
        """)
    )
    db.execute(
        text("""
            ALTER TABLE attendance_records
            ADD COLUMN IF NOT EXISTS session_class_id VARCHAR(20),
            ADD COLUMN IF NOT EXISTS session_center_id VARCHAR(20),
            ADD COLUMN IF NOT EXISTS session_start_time TIME,
            ADD COLUMN IF NOT EXISTS session_end_time TIME
        """)
    )
    db.execute(text("""
        ALTER TABLE attendance_records
        ADD COLUMN IF NOT EXISTS session_block JSONB,
        ADD COLUMN IF NOT EXISTS check_in_record_id UUID
    """))
    db.execute(text("""
        ALTER TABLE attendance_records
        ADD COLUMN IF NOT EXISTS student_names JSONB,
        ADD COLUMN IF NOT EXISTS session_students JSONB
    """))
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
    db.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_attendance_records_time_id
            ON attendance_records(checked_at DESC, record_id DESC)
    """))
    db.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_attendance_records_user_time_id
            ON attendance_records(user_code, checked_at DESC, record_id DESC)
    """))
    db.commit()


def snapshot_attendance_session(db: Session, record):
    if not record["class_id"]:
        return dict(record)

    snapshot = db.execute(
        text("""
            UPDATE attendance_records ar
            SET session_class_id = c.class_id,
                session_center_id = c.center_id,
                session_start_time = c.start_time,
                session_end_time = c.end_time
            FROM classes c
            WHERE ar.record_id = :record_id AND c.class_id = ar.class_id
            RETURNING ar.session_class_id, ar.session_center_id,
                      ar.session_start_time, ar.session_end_time
        """),
        {"record_id": record["record_id"]},
    ).mappings().one()
    result = {**dict(record), **dict(snapshot)}
    if record.get("event_type") == "CHECK_IN":
        block = db.execute(text(f"""
            WITH RECURSIVE checked AS (
                SELECT CAST(:checked_at AS TIMESTAMPTZ) AT TIME ZONE '{LOCAL_TIMEZONE}' AS local_checked_at
            ),
{EFFECTIVE_ASSIGNMENTS_FOR_CHECKED_AT_CTE},
            block AS (
                SELECT c.class_id, c.center_id, c.day_of_week, c.start_time, c.end_time
                FROM classes c WHERE c.class_id = :class_id
                UNION
                SELECT c.class_id, c.center_id, c.day_of_week, c.start_time, c.end_time
                FROM classes c
                JOIN block b ON c.center_id = b.center_id AND c.day_of_week = b.day_of_week
                            AND c.start_time = b.end_time AND c.end_time > c.start_time
                JOIN assigned_classes ac ON ac.class_id = c.class_id
            )
            SELECT b.*, centers.name AS center_name FROM block b
            JOIN centers ON centers.center_id = b.center_id ORDER BY b.start_time, b.class_id
        """), {
            "checked_at": record["checked_at"], "teacher_id": record["teacher_id"],
            "class_id": record["class_id"],
        }).mappings().all()
        saved_block = json.loads(json.dumps([dict(item) for item in block], default=str))
        db.execute(text("UPDATE attendance_records SET session_block = CAST(:block AS JSONB) WHERE record_id = :id"),
                   {"block": json.dumps(saved_block), "id": record["record_id"]})
        result["session_block"] = saved_block
    return result


def ensure_assignment_tables(db: Session) -> None:
    ensure_class_teachers_table(db)
    ensure_class_teacher_reassignment_overrides_table(db)


def haversine_distance(lat1, lon1, lat2, lon2):
    r = 6371000.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return r * c


def get_closest_center(db: Session, latitude: float, longitude: float):
    centers = db.execute(text("SELECT center_id, name, latitude, longitude FROM centers")).mappings().all()
    closest_distance = None
    closest_center = None

    for center in centers:
        distance = haversine_distance(
            latitude,
            longitude,
            float(center["latitude"]),
            float(center["longitude"]),
        )
        if closest_distance is None or distance < closest_distance:
            closest_distance = distance
            closest_center = center

    if not closest_center:
        return {
            "center_id": None,
            "name": None,
            "distance": None,
            "status": "INVALID",
        }

    return {
        "center_id": closest_center["center_id"],
        "name": closest_center["name"],
        "distance": closest_distance,
        "status": "VALID" if closest_distance is not None and closest_distance <= 200 else "INVALID",
    }


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
{EFFECTIVE_ASSIGNMENTS_FOR_CHECKED_AT_CTE}
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


def get_checkout_status(db: Session, class_id: str, checked_at: datetime) -> str:
    row = db.execute(
        text(f"""
            WITH checked AS (
                SELECT CAST(:checked_at AS TIMESTAMPTZ) AT TIME ZONE '{LOCAL_TIMEZONE}' AS local_checked_at
            )
            SELECT
                CASE
                    WHEN CAST(checked.local_checked_at AS TIME) < c.end_time
                        THEN 'LEFT_EARLY'
                    WHEN CAST(checked.local_checked_at AS TIME) <= c.end_time + INTERVAL '30 minutes'
                        THEN 'COMPLETED'
                    ELSE 'OVERTIME'
                END AS checkout_status
            FROM classes c
            CROSS JOIN checked
            WHERE c.class_id = :class_id
        """),
        {"class_id": class_id, "checked_at": checked_at},
    ).mappings().first()

    return row["checkout_status"] if row else "UNMATCHED"


def find_matching_checkout_session(db: Session, teacher_id: str | None, center_id: str | None, checked_at: datetime):
    if not teacher_id:
        return {"class_id": None, "attendance_status": "UNMATCHED"}

    center_filter = "AND c.center_id = :center_id" if center_id else ""
    session = db.execute(
        text(f"""
            WITH checked AS (
                SELECT CAST(:checked_at AS TIMESTAMPTZ) AT TIME ZONE '{LOCAL_TIMEZONE}' AS local_checked_at
            ),
{EFFECTIVE_ASSIGNMENTS_FOR_CHECKED_AT_CTE}
            SELECT c.class_id
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
              AND CAST(checked.local_checked_at AS TIME) >= c.start_time
            ORDER BY c.start_time DESC
            LIMIT 1
        """),
        {"teacher_id": teacher_id, "center_id": center_id, "checked_at": checked_at},
    ).mappings().first()

    if not session:
        return {"class_id": None, "attendance_status": "UNMATCHED"}

    return {
        "class_id": session["class_id"],
        "attendance_status": get_checkout_status(db, session["class_id"], checked_at),
    }


def find_checkout_class_for_open_check_in(db: Session, teacher_id: str | None, check_in_class_id: str, checked_at: datetime):
    if not teacher_id:
        return check_in_class_id

    row = db.execute(
        text(f"""
            WITH RECURSIVE checked AS (
                SELECT CAST(:checked_at AS TIMESTAMPTZ) AT TIME ZONE '{LOCAL_TIMEZONE}' AS local_checked_at
            ),
            active_teacher_overrides AS (
                SELECT override.class_id, override.original_teacher_id, override.replacement_teacher_id
                FROM class_teacher_reassignment_overrides override
                CROSS JOIN checked
                WHERE override.effective_date <= CAST(checked.local_checked_at AS DATE)
                  AND override.expires_on >= CAST(checked.local_checked_at AS DATE)
            ),
            effective_assignment_rows AS (
                SELECT
                    ct.class_id,
                    COALESCE(active_override.replacement_teacher_id, ct.teacher_id) AS teacher_id
                FROM class_teachers ct
                LEFT JOIN active_teacher_overrides active_override
                    ON active_override.class_id = ct.class_id
                   AND active_override.original_teacher_id = ct.teacher_id

                UNION

                SELECT
                    c.class_id,
                    COALESCE(active_override.replacement_teacher_id, c.teacher_id) AS teacher_id
                FROM classes c
                LEFT JOIN active_teacher_overrides active_override
                    ON active_override.class_id = c.class_id
                   AND active_override.original_teacher_id = c.teacher_id
                WHERE c.teacher_id IS NOT NULL
            ),
            assigned_classes AS (
                SELECT DISTINCT class_id
                FROM effective_assignment_rows
                WHERE teacher_id = :teacher_id
            ),
            contiguous_classes AS (
                SELECT c.class_id, c.center_id, c.day_of_week, c.start_time, c.end_time
                FROM classes c
                WHERE c.class_id = :check_in_class_id

                UNION ALL

                SELECT next_class.class_id,
                       next_class.center_id,
                       next_class.day_of_week,
                       next_class.start_time,
                       next_class.end_time
                FROM classes next_class
                JOIN contiguous_classes current_class
                  ON next_class.center_id = current_class.center_id
                 AND next_class.day_of_week = current_class.day_of_week
                 AND next_class.start_time = current_class.end_time
                JOIN assigned_classes ac ON ac.class_id = next_class.class_id
            )
            SELECT cc.class_id
            FROM contiguous_classes cc
            CROSS JOIN checked
            ORDER BY
                CASE
                    WHEN CAST(checked.local_checked_at AS TIME) >= cc.start_time THEN 0
                    ELSE 1
                END,
                CASE
                    WHEN CAST(checked.local_checked_at AS TIME) >= cc.start_time THEN cc.start_time
                    ELSE NULL
                END DESC NULLS LAST,
                cc.start_time
            LIMIT 1
        """),
        {
            "teacher_id": teacher_id,
            "check_in_class_id": check_in_class_id,
            "checked_at": checked_at,
        },
    ).mappings().first()

    return row["class_id"] if row else check_in_class_id


def find_open_check_in(db: Session, user_code: str, checked_at: datetime):
    return db.execute(text(f"""
        SELECT ar.* FROM attendance_records ar
        WHERE ar.user_code = :user_code AND ar.event_type = 'CHECK_IN'
          AND ar.checked_at <= :checked_at
          AND (ar.checked_at AT TIME ZONE '{LOCAL_TIMEZONE}')::date =
              (CAST(:checked_at AS TIMESTAMPTZ) AT TIME ZONE '{LOCAL_TIMEZONE}')::date
          AND NOT EXISTS (
              SELECT 1 FROM attendance_records checkout
              WHERE checkout.user_code = ar.user_code AND checkout.event_type = 'CHECK_OUT'
                AND (checkout.check_in_record_id = ar.record_id OR (
                    checkout.check_in_record_id IS NULL
                    AND checkout.checked_at > ar.checked_at AND checkout.checked_at <= :checked_at
                    AND (checkout.checked_at AT TIME ZONE '{LOCAL_TIMEZONE}')::date =
                        (ar.checked_at AT TIME ZONE '{LOCAL_TIMEZONE}')::date
                ))
          )
        ORDER BY ar.checked_at DESC, ar.record_id DESC LIMIT 1
    """), {"user_code": user_code, "checked_at": checked_at}).mappings().first()


def link_checkout(db: Session, record, check_in):
    result = dict(record)
    if not check_in:
        return result
    db.execute(text("""
        UPDATE attendance_records SET check_in_record_id = :check_in_id WHERE record_id = :id
    """), {"check_in_id": check_in["record_id"], "id": record["record_id"]})
    result["check_in_record_id"] = check_in["record_id"]
    return result


def validate_checkout_rosters(payload, check_in):
    block = check_in.get("session_block") if check_in else None
    rosters = payload.session_students
    if rosters is not None:
        if not block or {item.class_id for item in rosters} != {shift["class_id"] for shift in block}:
            raise HTTPException(status_code=400, detail="student lists must match the checked-in teaching sessions")
    elif block and len(block) > 1:
        raise HTTPException(status_code=400, detail="enter students separately for each teaching session")


def save_checkout_students(db: Session, record, payload):
    names = payload.student_names
    rosters = [item.model_dump() for item in payload.session_students] if payload.session_students is not None else None
    db.execute(text("""
        UPDATE attendance_records SET student_names = CAST(:student_names AS JSONB),
            session_students = CAST(:session_students AS JSONB)
        WHERE record_id = :record_id AND event_type = 'CHECK_OUT'
    """), {"student_names": json.dumps(names, ensure_ascii=False) if names is not None else None,
           "session_students": json.dumps(rosters, ensure_ascii=False) if rosters is not None else None,
           "record_id": record["record_id"]})
    return {**dict(record), "student_names": names, "student_count": len(names) if names is not None else None,
            "session_students": rosters}


def resolve_checkout_session(db, check_in, teacher_id, center_id, checked_at):
    block = check_in.get("session_block") if check_in else None
    if block:
        clock = local_datetime(checked_at)
        started = [shift for shift in block if str(shift["start_time"]) <= clock.strftime("%H:%M:%S")]
        shift = (started or block)[-1 if started else 0]
        end = datetime.combine(clock.date(), datetime.strptime(str(shift["end_time"])[:8], "%H:%M:%S").time(), clock.tzinfo)
        status = "LEFT_EARLY" if clock < end else "COMPLETED" if clock <= end + timedelta(minutes=30) else "OVERTIME"
        class_id = db.execute(text("SELECT class_id FROM classes WHERE class_id = :id"), {"id": shift["class_id"]}).scalar()
        return {"class_id": class_id, "attendance_status": status, "snapshot": shift}
    if check_in and check_in["class_id"]:
        class_id = find_checkout_class_for_open_check_in(db, teacher_id, check_in["class_id"], checked_at)
        return {"class_id": class_id, "attendance_status": get_checkout_status(db, class_id, checked_at)}
    return find_matching_checkout_session(db, teacher_id, center_id, checked_at)


def snapshot_checkout(db, record, session_match, check_in):
    snapshot = session_match.get("snapshot")
    if snapshot:
        values = {
            "session_class_id": snapshot["class_id"], "session_center_id": snapshot["center_id"],
            "session_start_time": snapshot["start_time"], "session_end_time": snapshot["end_time"],
        }
        db.execute(text("""
            UPDATE attendance_records
            SET session_class_id = :session_class_id, session_center_id = :session_center_id,
                session_start_time = CAST(:session_start_time AS TIME), session_end_time = CAST(:session_end_time AS TIME)
            WHERE record_id = :record_id
        """), {**values, "record_id": record["record_id"]})
        record = {**dict(record), **values}
    else:
        record = snapshot_attendance_session(db, record)
    return link_checkout(db, record, check_in)


@router.get("/attendance-records")
def get_attendance_records(
    current_user: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER, ROLE_TEACHER)),
    db: Session = Depends(get_db),
    limit: int = Query(200, ge=1, le=500),
    before_checked_at: datetime | None = Query(None),
    before_record_id: UUID | None = Query(None),
):
    if (before_checked_at is None) != (before_record_id is None):
        raise HTTPException(status_code=400, detail="both attendance cursor fields are required")
    if before_checked_at is not None and before_checked_at.utcoffset() is None:
        raise HTTPException(status_code=400, detail="attendance cursor timestamp must include a timezone")
    params = {"limit": limit}
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
            ar.attendance_status,
            ar.event_type,
            ar.session_class_id,
            ar.session_center_id,
            ar.session_start_time,
            ar.session_end_time,
            ar.session_block,
            ar.check_in_record_id,
            ar.student_names,
            ar.session_students,
            jsonb_array_length(ar.student_names) AS student_count
        FROM attendance_records ar
        JOIN users u ON u.user_code = ar.user_code
    """

    filters = []
    if current_user.role == ROLE_TEACHER:
        filters.append("ar.user_code = :user_code")
        params["user_code"] = current_user.user_code

    if before_checked_at is not None:
        filters.append("(ar.checked_at, ar.record_id) < (:before_checked_at, CAST(:before_record_id AS UUID))")
        params["before_checked_at"] = before_checked_at
        params["before_record_id"] = str(before_record_id)
    if filters:
        query += " WHERE " + " AND ".join(filters)
    query += " ORDER BY ar.checked_at DESC, ar.record_id DESC LIMIT :limit"

    records = db.execute(text(query), params).mappings().all()
    return [dict(item) for item in records]


def load_attendance_report(db, start_date, end_date, teacher_id, language):
    if end_date < start_date or (end_date - start_date).days >= 366:
        raise HTTPException(status_code=400, detail=(
            "Chọn khoảng ngày hợp lệ, tối đa 366 ngày." if language == "vi"
            else "Select a valid date range of at most 366 days."
        ))
    teachers = db.execute(text("""
        SELECT t.teacher_id, t.name AS teacher_name
        FROM teachers t
        WHERE (:teacher_id IS NULL OR t.teacher_id = :teacher_id)
        ORDER BY t.teacher_id
    """), {"teacher_id": teacher_id}).mappings().all()
    if teacher_id and not teachers:
        raise HTTPException(status_code=404, detail="Không tìm thấy giáo viên." if language == "vi" else "Teacher not found.")
    records = db.execute(text(f"""
        SELECT ar.* FROM attendance_records ar
        WHERE ar.teacher_id IS NOT NULL
          AND (:teacher_id IS NULL OR ar.teacher_id = :teacher_id)
          AND ar.checked_at >= (CAST(:start_date AS DATE)::timestamp AT TIME ZONE '{LOCAL_TIMEZONE}')
          AND ar.checked_at < ((CAST(:end_date AS DATE) + 1)::timestamp AT TIME ZONE '{LOCAL_TIMEZONE}')
        ORDER BY ar.checked_at, ar.record_id
    """), {"teacher_id": teacher_id, "start_date": start_date, "end_date": end_date}).mappings().all()
    return build_attendance_report(teachers, records, start_date, end_date)


@router.get("/attendance-records/report")
def get_teacher_attendance_report(
    start_date: date = Query(...), end_date: date = Query(...),
    teacher_id: str | None = Query(None), language: Literal["vi", "en"] = Query("vi"),
    _: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
    db: Session = Depends(get_db),
):
    return load_attendance_report(db, start_date, end_date, teacher_id, language)


@router.get("/attendance-records/export")
def export_teacher_attendance_report(
    start_date: date = Query(...), end_date: date = Query(...),
    teacher_id: str | None = Query(None), language: Literal["vi", "en"] = Query("vi"),
    _: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
    db: Session = Depends(get_db),
):
    report = load_attendance_report(db, start_date, end_date, teacher_id, language)
    report_file = build_report_workbook(report, language)
    name = report["summary"][0]["teacher_name"] if len(report["summary"]) == 1 else ("Tất cả giáo viên" if language == "vi" else "All teachers")
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', '_', name)
    filename = f"{name}_{start_date.isoformat()}_{end_date.isoformat()}.xlsx"
    return StreamingResponse(
        report_file,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=attendance.xlsx; filename*=UTF-8''{quote(filename, safe='')}"},
    )


@router.post("/attendance-records/check-in")
def check_in_attendance(
    payload: AttendanceCheckInPayload,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ensure_assignment_tables(db)

    recent_check_in = db.execute(
        text("""
            SELECT checked_at
            FROM attendance_records
            WHERE user_code = :user_code
              AND event_type = 'CHECK_IN'
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
    closest_center = get_closest_center(db, payload.latitude, payload.longitude)
    session_match = find_matching_class_session(db, current_user.teacher_id, closest_center["center_id"], record_checked_at)
    if not session_match["class_id"]:
        raise HTTPException(status_code=400, detail="no assigned teaching session available for attendance")

    record = db.execute(
        text("""
            INSERT INTO attendance_records (
                record_id, user_code, teacher_id, checked_at, latitude, longitude, accuracy_meters,
                status, nearest_center_name, class_id, attendance_status, event_type
            )
            VALUES (
                :record_id, :user_code, :teacher_id, :checked_at, :latitude, :longitude, :accuracy_meters,
                :status, :nearest_center_name, :class_id, :attendance_status, 'CHECK_IN'
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
                attendance_status,
                event_type
        """),
        {
            "record_id": record_id,
            "user_code": current_user.user_code,
            "teacher_id": current_user.teacher_id,
            "checked_at": record_checked_at,
            "latitude": payload.latitude,
            "longitude": payload.longitude,
            "accuracy_meters": payload.accuracy_meters,
            "status": closest_center["status"],
            "nearest_center_name": closest_center["name"],
            "class_id": session_match["class_id"],
            "attendance_status": session_match["attendance_status"],
        },
    ).mappings().first()
    record = snapshot_attendance_session(db, record)
    db.commit()

    return {
        **dict(record),
        "display_name": current_user.display_name,
    }


@router.post("/attendance-records/check-out")
def check_out_attendance(
    payload: AttendanceCheckOutPayload,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ensure_assignment_tables(db)

    recent_check_out = db.execute(
        text("""
            SELECT checked_at
            FROM attendance_records
            WHERE user_code = :user_code
              AND event_type = 'CHECK_OUT'
              AND checked_at > NOW() - (:cooldown_minutes * INTERVAL '1 minute')
            ORDER BY checked_at DESC
            LIMIT 1
        """),
        {
            "user_code": current_user.user_code,
            "cooldown_minutes": CHECK_OUT_COOLDOWN_MINUTES,
        },
    ).mappings().first()

    if recent_check_out:
        raise HTTPException(
            status_code=429,
            detail=f"please wait {CHECK_OUT_COOLDOWN_MINUTES} minutes between check-outs",
        )

    record_checked_at = datetime.now(timezone.utc)
    check_in = find_open_check_in(db, current_user.user_code, record_checked_at)
    if not check_in:
        raise HTTPException(status_code=400, detail="no open check-in found for today")
    validate_checkout_rosters(payload, check_in)

    record_id = str(uuid4())
    closest_center = get_closest_center(db, payload.latitude, payload.longitude)
    session_match = resolve_checkout_session(db, check_in, current_user.teacher_id, closest_center["center_id"], record_checked_at)
    class_id = session_match["class_id"]
    checkout_status = session_match["attendance_status"]
    if not class_id and not session_match.get("snapshot"):
        raise HTTPException(status_code=400, detail="no assigned teaching session available for attendance")

    record = db.execute(
        text("""
            INSERT INTO attendance_records (
                record_id, user_code, teacher_id, checked_at, latitude, longitude, accuracy_meters,
                status, nearest_center_name, class_id, attendance_status, event_type
            )
            VALUES (
                :record_id, :user_code, :teacher_id, :checked_at, :latitude, :longitude, :accuracy_meters,
                :status, :nearest_center_name, :class_id, :attendance_status, 'CHECK_OUT'
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
                attendance_status,
                event_type
        """),
        {
            "record_id": record_id,
            "user_code": current_user.user_code,
            "teacher_id": current_user.teacher_id,
            "checked_at": record_checked_at,
            "latitude": payload.latitude,
            "longitude": payload.longitude,
            "accuracy_meters": payload.accuracy_meters,
            "status": closest_center["status"],
            "nearest_center_name": closest_center["name"],
            "class_id": class_id,
            "attendance_status": checkout_status,
        },
    ).mappings().first()
    record = snapshot_checkout(db, record, session_match, check_in)
    record = save_checkout_students(db, record, payload)
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
    ensure_assignment_tables(db)

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
    check_in = find_open_check_in(db, teacher["user_code"], payload.checked_at) if payload.event_type == "CHECK_OUT" else None
    if payload.event_type == "CHECK_OUT":
        validate_checkout_rosters(payload, check_in)
    session_match = (
        resolve_checkout_session(db, check_in, teacher["teacher_id"], center["center_id"], payload.checked_at)
        if payload.event_type == "CHECK_OUT"
        else find_matching_class_session(db, teacher["teacher_id"], center["center_id"], payload.checked_at)
    )
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
                attendance_status,
                event_type
            )
            VALUES (
                :record_id,
                :user_code,
                :teacher_id,
                :checked_at,
                :latitude,
                :longitude,
                NULL,
                :record_status,
                :nearest_center_name,
                :class_id,
                :attendance_status,
                :event_type
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
                attendance_status,
                event_type
        """),
        {
            "record_id": record_id,
            "user_code": teacher["user_code"],
            "teacher_id": teacher["teacher_id"],
            "checked_at": payload.checked_at,
            "latitude": center["latitude"],
            "longitude": center["longitude"],
            "record_status": "MANUAL",
            "nearest_center_name": center["name"],
            "class_id": session_match["class_id"],
            "attendance_status": "MANUAL" if payload.event_type == "CHECK_IN" else session_match["attendance_status"],
            "event_type": payload.event_type,
        },
    ).mappings().first()
    record = snapshot_checkout(db, record, session_match, check_in) if payload.event_type == "CHECK_OUT" else snapshot_attendance_session(db, record)
    if payload.event_type == "CHECK_OUT":
        record = save_checkout_students(db, record, payload)
    db.commit()

    return {
        **dict(record),
        "display_name": teacher["display_name"],
    }

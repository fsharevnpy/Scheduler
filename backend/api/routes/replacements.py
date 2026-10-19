from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.permissions import ROLE_DEVELOPER, ROLE_MANAGER, require_roles
from db import get_db
from schemas.auth import CurrentUser
from schemas.scheduling import AssignReplacementPayload
from services.class_assignments import (
    class_teacher_count,
    ensure_class_teacher_reassignment_overrides_table,
    ensure_class_teachers_table,
)


router = APIRouter()

ELO_WEIGHT = 0.3
EDUCATION_WEIGHT = 0.2
CENTER_MATCH_WEIGHT = 0.25
TIME_MATCH_WEIGHT = 0.25


@router.get("/classes/{class_id}/replacement-suggestions")
def get_replacement_suggestions(
    class_id: str,
    replace_teacher_id: str | None = None,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    ensure_class_teachers_table(db)
    ensure_class_teacher_reassignment_overrides_table(db)
    target_class = db.execute(
        text(f"""
            SELECT
                c.class_id,
                c.day_of_week,
                c.center_id,
                c.start_time,
                c.end_time
            FROM classes c
            WHERE c.class_id = :class_id
        """),
        {"class_id": class_id},
    ).mappings().first()

    if not target_class:
        raise HTTPException(status_code=404, detail="class not found")

    if class_teacher_count(db, class_id) >= 2 and not replace_teacher_id:
        return []

    elo_range = db.execute(
        text("""
            SELECT MIN(elo) AS min_elo, MAX(elo) AS max_elo
            FROM teachers
        """)
    ).mappings().first()

    min_elo = elo_range["min_elo"]
    max_elo = elo_range["max_elo"]

    education_range = db.execute(
        text("""
            SELECT MIN(COALESCE(education_score, 0)) AS min_education_score,
                   MAX(COALESCE(education_score, 0)) AS max_education_score
            FROM teachers
        """)
    ).mappings().first()

    min_education_score = education_range["min_education_score"]
    max_education_score = education_range["max_education_score"]

    if min_education_score is not None:
        min_education_score = float(min_education_score)
    if max_education_score is not None:
        max_education_score = float(max_education_score)

    rows = db.execute(
        text("""
            WITH active_teacher_overrides AS (
                SELECT class_id, original_teacher_id, replacement_teacher_id
                FROM class_teacher_reassignment_overrides
                WHERE effective_date <= CAST(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE)
                  AND expires_on >= CAST(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE)
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
            )
            SELECT
                t.teacher_id,
                t.name,
                t.elo,
                COALESCE(t.education_score, 0) AS education_score,
                t.max_slots_per_day,
                t.active,
                COALESCE((
                    SELECT COUNT(*)
                    FROM effective_assignment_rows ea2
                    JOIN classes c2 ON c2.class_id = ea2.class_id
                    WHERE ea2.teacher_id = t.teacher_id
                      AND c2.day_of_week = :day_of_week
                      AND c2.status IN ('ASSIGNED', 'NEED_REPLACEMENT')
                ), 0) AS assigned_slots_that_day,
                CASE
                    WHEN EXISTS (
                        SELECT 1
                        FROM teacher_preferences tp
                        WHERE tp.teacher_id = t.teacher_id
                          AND tp.preferred_center_id = :center_id
                    ) THEN 1 ELSE 0
                END AS center_match,
                CASE
                    WHEN EXISTS (
                        SELECT 1
                        FROM teacher_preferences tp
                        WHERE tp.teacher_id = t.teacher_id
                          AND tp.day_of_week = :day_of_week
                          AND tp.preferred_start_time <= :start_time
                          AND tp.preferred_end_time >= :end_time
                    ) THEN 1 ELSE 0
                END AS time_match
            FROM teachers t
            WHERE t.active = TRUE
              AND NOT EXISTS (
                  SELECT 1
                  FROM class_teachers existing_assignment
                  WHERE existing_assignment.class_id = :class_id
                    AND existing_assignment.teacher_id = t.teacher_id
              )
              AND NOT EXISTS (
                  SELECT 1
                  FROM effective_assignment_rows effective_assignment
                  WHERE effective_assignment.class_id = :class_id
                    AND effective_assignment.teacher_id = t.teacher_id
              )
              AND NOT EXISTS (
                  SELECT 1
                  FROM leave_requests lr
                  JOIN classes lc ON lc.class_id = lr.class_id
                  WHERE lr.teacher_id = t.teacher_id
                    AND lc.day_of_week = :day_of_week
                    AND lr.status IN ('REQUESTED', 'APPROVED')
              )
              AND NOT EXISTS (
                  SELECT 1
                  FROM effective_assignment_rows ea3
                  JOIN classes c3 ON c3.class_id = ea3.class_id
                  WHERE ea3.teacher_id = t.teacher_id
                    AND c3.day_of_week = :day_of_week
                    AND c3.status IN ('ASSIGNED', 'NEED_REPLACEMENT')
                    AND c3.class_id <> :class_id
                    AND c3.start_time < :end_time
                    AND c3.end_time > :start_time
              )
        """),
        {
            "center_id": target_class["center_id"],
            "class_id": class_id,
            "day_of_week": target_class["day_of_week"],
            "start_time": target_class["start_time"],
            "end_time": target_class["end_time"],
        },
    ).mappings().all()

    suggestions = []
    for row in rows:
        education_score = float(row["education_score"])

        if row["assigned_slots_that_day"] >= row["max_slots_per_day"]:
            continue

        if min_elo is None or max_elo is None:
            normalized_score = 0.0
        elif max_elo == min_elo:
            normalized_score = 0.5
        else:
            normalized_score = (row["elo"] - min_elo) / (max_elo - min_elo)

        if min_education_score is None or max_education_score is None:
            normalized_education_score = 0.0
        elif max_education_score == min_education_score:
            normalized_education_score = 0.5
        else:
            normalized_education_score = (education_score - min_education_score) / (max_education_score - min_education_score)

        final_score = (
            normalized_score * ELO_WEIGHT
            + normalized_education_score * EDUCATION_WEIGHT
            + row["center_match"] * CENTER_MATCH_WEIGHT
            + row["time_match"] * TIME_MATCH_WEIGHT
        )

        item = dict(row)
        item["education_score"] = education_score
        item["normalized_score"] = round(normalized_score, 4)
        item["normalized_education_score"] = round(normalized_education_score, 4)
        item["final_score"] = final_score
        suggestions.append(item)

    suggestions.sort(key=lambda item: item["final_score"], reverse=True)
    return suggestions


def update_class_assignment_state(db: Session, class_id: str) -> None:
    remaining_teacher_id = db.execute(
        text("""
            SELECT teacher_id
            FROM class_teachers
            WHERE class_id = :class_id
            ORDER BY assigned_at, teacher_id
            LIMIT 1
        """),
        {"class_id": class_id},
    ).scalar_one_or_none()

    active_leave_count = db.execute(
        text("""
            SELECT COUNT(*)
            FROM leave_requests
            WHERE class_id = :class_id
              AND status IN ('REQUESTED', 'APPROVED')
        """),
        {"class_id": class_id},
    ).scalar_one()

    next_status = "OPEN"
    if remaining_teacher_id:
        next_status = "NEED_REPLACEMENT" if active_leave_count > 0 else "ASSIGNED"

    db.execute(
        text("""
            UPDATE classes
            SET teacher_id = :teacher_id,
                status = :status
            WHERE class_id = :class_id
        """),
        {
            "class_id": class_id,
            "teacher_id": remaining_teacher_id,
            "status": next_status,
        },
    )


@router.put("/classes/{class_id}/assign-replacement")
def assign_replacement(
    class_id: str,
    payload: AssignReplacementPayload,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    ensure_class_teachers_table(db)
    target_class = db.execute(
        text(f"""
            SELECT
                c.class_id,
                c.day_of_week,
                c.center_id,
                c.start_time,
                c.end_time,
                c.status
            FROM classes c
            WHERE c.class_id = :class_id
        """),
        {"class_id": class_id},
    ).mappings().first()

    if not target_class:
        raise HTTPException(status_code=404, detail="class not found")

    existing_assignment_count = class_teacher_count(db, class_id)
    if existing_assignment_count >= 2:
        raise HTTPException(status_code=400, detail="class already has maximum 2 teachers")

    already_assigned = db.execute(
        text("""
            SELECT 1
            FROM class_teachers
            WHERE class_id = :class_id
              AND teacher_id = :teacher_id
        """),
        {"class_id": class_id, "teacher_id": payload.teacher_id},
    ).first()

    if already_assigned:
        raise HTTPException(status_code=400, detail="teacher is already assigned to this class")

    teacher_row = db.execute(
        text("""
            SELECT teacher_id, name, active, max_slots_per_day, elo
            FROM teachers
            WHERE teacher_id = :teacher_id
        """),
        {"teacher_id": payload.teacher_id},
    ).mappings().first()

    if not teacher_row:
        raise HTTPException(status_code=404, detail="replacement teacher not found")

    if not teacher_row["active"]:
        raise HTTPException(status_code=400, detail="replacement teacher is inactive")

    active_leave_request = db.execute(
        text("""
            SELECT 1
            FROM leave_requests lr
            JOIN classes lc ON lc.class_id = lr.class_id
            WHERE lr.teacher_id = :teacher_id
              AND lc.day_of_week = :day_of_week
              AND lr.status IN ('REQUESTED', 'APPROVED')
        """),
        {
            "teacher_id": payload.teacher_id,
            "day_of_week": target_class["day_of_week"],
        },
    ).first()

    if active_leave_request:
        raise HTTPException(status_code=400, detail="replacement teacher already has a leave request on that day")

    overlap = db.execute(
        text("""
            SELECT 1
            FROM class_teachers ct
            JOIN classes c ON c.class_id = ct.class_id
            WHERE ct.teacher_id = :teacher_id
              AND c.day_of_week = :day_of_week
              AND c.class_id <> :class_id
              AND c.status IN ('ASSIGNED', 'NEED_REPLACEMENT')
              AND c.start_time < :end_time
              AND c.end_time > :start_time
        """),
        {
            "teacher_id": payload.teacher_id,
            "day_of_week": target_class["day_of_week"],
            "class_id": class_id,
            "start_time": target_class["start_time"],
            "end_time": target_class["end_time"],
        },
    ).first()

    if overlap:
        raise HTTPException(status_code=400, detail="replacement teacher has schedule conflict")

    assigned_count = db.execute(
        text("""
            SELECT COUNT(*)
            FROM class_teachers ct
            JOIN classes c ON c.class_id = ct.class_id
            WHERE ct.teacher_id = :teacher_id
              AND c.day_of_week = :day_of_week
              AND c.status IN ('ASSIGNED', 'NEED_REPLACEMENT')
        """),
        {
            "teacher_id": payload.teacher_id,
            "day_of_week": target_class["day_of_week"],
        },
    ).scalar_one()

    if assigned_count >= teacher_row["max_slots_per_day"]:
        raise HTTPException(status_code=400, detail="replacement teacher exceeds max slots per day")

    db.execute(
        text("""
            INSERT INTO class_teachers (class_id, teacher_id)
            VALUES (:class_id, :teacher_id)
            ON CONFLICT (class_id, teacher_id) DO NOTHING
        """),
        {
            "teacher_id": payload.teacher_id,
            "class_id": class_id,
        },
    )

    db.execute(
        text("""
            UPDATE classes
            SET teacher_id = COALESCE(teacher_id, :teacher_id),
                status = 'ASSIGNED'
            WHERE class_id = :class_id
        """),
        {
            "teacher_id": payload.teacher_id,
            "class_id": class_id,
        },
    )

    db.commit()
    return {
        "message": "replacement assigned",
        "class_id": class_id,
        "teacher_id": payload.teacher_id,
    }


@router.delete("/classes/{class_id}/teachers/{teacher_id}")
def remove_class_teacher(
    class_id: str,
    teacher_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    ensure_class_teachers_table(db)

    existing_assignment = db.execute(
        text("""
            SELECT 1
            FROM class_teachers
            WHERE class_id = :class_id
              AND teacher_id = :teacher_id
        """),
        {"class_id": class_id, "teacher_id": teacher_id},
    ).first()

    if not existing_assignment:
        raise HTTPException(status_code=404, detail="teacher is not assigned to this class")

    db.execute(
        text("""
            DELETE FROM class_teachers
            WHERE class_id = :class_id
              AND teacher_id = :teacher_id
        """),
        {"class_id": class_id, "teacher_id": teacher_id},
    )
    update_class_assignment_state(db, class_id)
    db.commit()

    return {"message": "teacher removed from class", "class_id": class_id, "teacher_id": teacher_id}


def temporary_teaching_date(day_of_week, requested=None, today=None):
    today = today or datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date()
    weekday = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"].index(day_of_week)
    target = requested or today + timedelta(days=(weekday - today.weekday()) % 7)
    if target < today or target.weekday() != weekday:
        raise HTTPException(status_code=400, detail="Please select an upcoming teaching date for this class.")
    return target


@router.put("/classes/{class_id}/teachers/{teacher_id}/reassign")
def reassign_class_teacher(
    class_id: str,
    teacher_id: str,
    payload: AssignReplacementPayload,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    ensure_class_teachers_table(db)
    ensure_class_teacher_reassignment_overrides_table(db)

    if teacher_id == payload.teacher_id:
        raise HTTPException(status_code=400, detail="replacement teacher must be different")

    existing_assignment = db.execute(
        text("""
            SELECT 1
            FROM class_teachers
            WHERE class_id = :class_id
              AND teacher_id = :teacher_id
        """),
        {"class_id": class_id, "teacher_id": teacher_id},
    ).first()

    if not existing_assignment:
        raise HTTPException(status_code=404, detail="teacher is not assigned to this class")

    target_class = db.execute(
        text("""
            SELECT class_id, day_of_week, center_id, start_time, end_time, status
            FROM classes
            WHERE class_id = :class_id
        """),
        {"class_id": class_id},
    ).mappings().first()

    if not target_class:
        raise HTTPException(status_code=404, detail="class not found")

    replacement_exists = db.execute(
        text("""
            SELECT 1
            FROM class_teachers
            WHERE class_id = :class_id
              AND teacher_id = :replacement_teacher_id
        """),
        {"class_id": class_id, "replacement_teacher_id": payload.teacher_id},
    ).first()

    if replacement_exists:
        raise HTTPException(status_code=400, detail="replacement teacher is already assigned to this class")

    teacher_row = db.execute(
        text("""
            SELECT teacher_id, name, active, max_slots_per_day
            FROM teachers
            WHERE teacher_id = :replacement_teacher_id
        """),
        {"replacement_teacher_id": payload.teacher_id},
    ).mappings().first()

    if not teacher_row:
        raise HTTPException(status_code=404, detail="replacement teacher not found")

    if not teacher_row["active"]:
        raise HTTPException(status_code=400, detail="replacement teacher is inactive")

    active_leave_request = db.execute(
        text("""
            SELECT 1
            FROM leave_requests lr
            JOIN classes lc ON lc.class_id = lr.class_id
            WHERE lr.teacher_id = :teacher_id
              AND lc.day_of_week = :day_of_week
              AND lr.status IN ('REQUESTED', 'APPROVED')
        """),
        {"teacher_id": payload.teacher_id, "day_of_week": target_class["day_of_week"]},
    ).first()

    if active_leave_request:
        raise HTTPException(status_code=400, detail="replacement teacher already has a leave request on that day")

    overlap = db.execute(
        text("""
            SELECT 1
            FROM class_teachers ct
            JOIN classes c ON c.class_id = ct.class_id
            WHERE ct.teacher_id = :teacher_id
              AND c.day_of_week = :day_of_week
              AND c.class_id <> :class_id
              AND c.status IN ('ASSIGNED', 'NEED_REPLACEMENT')
              AND c.start_time < :end_time
              AND c.end_time > :start_time
        """),
        {
            "teacher_id": payload.teacher_id,
            "day_of_week": target_class["day_of_week"],
            "class_id": class_id,
            "start_time": target_class["start_time"],
            "end_time": target_class["end_time"],
        },
    ).first()

    if overlap:
        raise HTTPException(status_code=400, detail="replacement teacher has schedule conflict")

    assigned_count = db.execute(
        text("""
            SELECT COUNT(*)
            FROM class_teachers ct
            JOIN classes c ON c.class_id = ct.class_id
            WHERE ct.teacher_id = :teacher_id
              AND c.day_of_week = :day_of_week
              AND c.status IN ('ASSIGNED', 'NEED_REPLACEMENT')
        """),
        {"teacher_id": payload.teacher_id, "day_of_week": target_class["day_of_week"]},
    ).scalar_one()

    if assigned_count >= teacher_row["max_slots_per_day"]:
        raise HTTPException(status_code=400, detail="replacement teacher exceeds max slots per day")

    mode = payload.mode.upper()
    if mode == "TEMPORARY":
        effective_date = temporary_teaching_date(target_class["day_of_week"], payload.effective_date)
        db.execute(
            text("""
                INSERT INTO class_teacher_reassignment_overrides (
                    class_id,
                    original_teacher_id,
                    replacement_teacher_id,
                    reassignment_mode,
                    effective_date,
                    expires_on,
                    created_by
                )
                VALUES (
                    :class_id,
                    :teacher_id,
                    :replacement_teacher_id,
                    :reassignment_mode,
                    :effective_date,
                    :effective_date,
                    :created_by
                )
                ON CONFLICT (class_id, original_teacher_id, effective_date)
                DO UPDATE SET
                    replacement_teacher_id = EXCLUDED.replacement_teacher_id,
                    reassignment_mode = EXCLUDED.reassignment_mode,
                    expires_on = EXCLUDED.expires_on,
                    created_by = EXCLUDED.created_by
            """),
            {
                "class_id": class_id,
                "teacher_id": teacher_id,
                "replacement_teacher_id": payload.teacher_id,
                "reassignment_mode": mode,
                "effective_date": effective_date,
                "created_by": current_user.user_code,
            },
        )
        db.commit()
        update_class_assignment_state(db, class_id)
        return {
            "message": "teacher temporarily reassigned",
            "effective_date": effective_date,
            "class_id": class_id,
            "old_teacher_id": teacher_id,
            "teacher_id": payload.teacher_id,
            "mode": mode,
        }

    db.execute(
        text("""
            DELETE FROM class_teacher_reassignment_overrides
            WHERE class_id = :class_id
              AND original_teacher_id = :teacher_id
        """),
        {"class_id": class_id, "teacher_id": teacher_id},
    )
    db.execute(
        text("""
            DELETE FROM class_teachers
            WHERE class_id = :class_id
              AND teacher_id = :teacher_id
        """),
        {"class_id": class_id, "teacher_id": teacher_id},
    )
    db.execute(
        text("""
            INSERT INTO class_teachers (class_id, teacher_id)
            VALUES (:class_id, :teacher_id)
        """),
        {"class_id": class_id, "teacher_id": payload.teacher_id},
    )
    update_class_assignment_state(db, class_id)
    db.commit()

    return {
        "message": "teacher reassigned",
        "class_id": class_id,
        "old_teacher_id": teacher_id,
        "teacher_id": payload.teacher_id,
        "mode": mode,
    }


@router.delete("/classes/{class_id}/teachers/{teacher_id}/temporary-reassignment")
def restore_permanent_class_teacher(
    class_id: str,
    teacher_id: str,
    effective_date: date | None = None,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    ensure_class_teachers_table(db)
    ensure_class_teacher_reassignment_overrides_table(db)

    assignment_exists = db.execute(
        text("""
            SELECT 1
            FROM class_teachers
            WHERE class_id = :class_id
              AND teacher_id = :teacher_id
        """),
        {"class_id": class_id, "teacher_id": teacher_id},
    ).first()

    if not assignment_exists:
        raise HTTPException(status_code=404, detail="permanent teacher is not assigned to this class")

    deleted = db.execute(
        text("""
            DELETE FROM class_teacher_reassignment_overrides
            WHERE class_id = :class_id
              AND original_teacher_id = :teacher_id
              AND effective_date = COALESCE(CAST(:effective_date AS DATE), CAST(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE))
              AND expires_on >= CAST(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE)
        """),
        {"class_id": class_id, "teacher_id": teacher_id, "effective_date": effective_date},
    ).rowcount

    if deleted == 0:
        raise HTTPException(status_code=404, detail="active temporary reassignment not found")

    update_class_assignment_state(db, class_id)
    db.commit()

    return {
        "message": "temporary reassignment restored to permanent teacher",
        "class_id": class_id,
        "teacher_id": teacher_id,
    }

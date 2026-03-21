from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.routes.common import get_day_of_week_sql
from core.permissions import ROLE_DEVELOPER, ROLE_MANAGER, require_roles
from db import get_db
from schemas.auth import CurrentUser
from schemas.scheduling import AssignReplacementPayload


router = APIRouter()


@router.get("/classes/{class_id}/replacement-suggestions")
def get_replacement_suggestions(
    class_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    target_class = db.execute(
        text(f"""
            SELECT
                c.class_id,
                c.class_date,
                c.center_id,
                c.start_time,
                c.end_time,
                c.teacher_id AS original_teacher_id,
                {get_day_of_week_sql()} AS day_of_week
            FROM classes c
            WHERE c.class_id = :class_id
        """),
        {"class_id": class_id},
    ).mappings().first()

    if not target_class:
        raise HTTPException(status_code=404, detail="class not found")

    rows = db.execute(
        text("""
            SELECT
                t.teacher_id,
                t.name,
                t.score,
                t.max_slots_per_day,
                t.active,
                COALESCE((
                    SELECT COUNT(*)
                    FROM classes c2
                    WHERE c2.teacher_id = t.teacher_id
                      AND c2.class_date = :class_date
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
              AND t.teacher_id <> :original_teacher_id
              AND NOT EXISTS (
                  SELECT 1
                  FROM classes c3
                  WHERE c3.teacher_id = t.teacher_id
                    AND c3.class_date = :class_date
                    AND c3.status IN ('ASSIGNED', 'NEED_REPLACEMENT')
                    AND c3.start_time < :end_time
                    AND c3.end_time > :start_time
              )
        """),
        {
            "class_date": target_class["class_date"],
            "center_id": target_class["center_id"],
            "day_of_week": target_class["day_of_week"],
            "start_time": target_class["start_time"],
            "end_time": target_class["end_time"],
            "original_teacher_id": target_class["original_teacher_id"],
        },
    ).mappings().all()

    suggestions = []
    for row in rows:
        if row["assigned_slots_that_day"] >= row["max_slots_per_day"]:
            continue

        final_score = row["score"] + row["center_match"] * 30 + row["time_match"] * 30
        item = dict(row)
        item["final_score"] = final_score
        suggestions.append(item)

    suggestions.sort(key=lambda item: item["final_score"], reverse=True)
    return suggestions


@router.put("/classes/{class_id}/assign-replacement")
def assign_replacement(
    class_id: str,
    payload: AssignReplacementPayload,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    target_class = db.execute(
        text(f"""
            SELECT
                c.class_id,
                c.class_date,
                c.center_id,
                c.start_time,
                c.end_time,
                c.teacher_id AS current_teacher_id,
                c.status,
                {get_day_of_week_sql()} AS day_of_week
            FROM classes c
            WHERE c.class_id = :class_id
        """),
        {"class_id": class_id},
    ).mappings().first()

    if not target_class:
        raise HTTPException(status_code=404, detail="class not found")

    teacher_row = db.execute(
        text("""
            SELECT teacher_id, name, active, max_slots_per_day, score
            FROM teachers
            WHERE teacher_id = :teacher_id
        """),
        {"teacher_id": payload.teacher_id},
    ).mappings().first()

    if not teacher_row:
        raise HTTPException(status_code=404, detail="replacement teacher not found")

    if not teacher_row["active"]:
        raise HTTPException(status_code=400, detail="replacement teacher is inactive")

    overlap = db.execute(
        text("""
            SELECT 1
            FROM classes c
            WHERE c.teacher_id = :teacher_id
              AND c.class_date = :class_date
              AND c.class_id <> :class_id
              AND c.status IN ('ASSIGNED', 'NEED_REPLACEMENT')
              AND c.start_time < :end_time
              AND c.end_time > :start_time
        """),
        {
            "teacher_id": payload.teacher_id,
            "class_date": target_class["class_date"],
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
            FROM classes
            WHERE teacher_id = :teacher_id
              AND class_date = :class_date
              AND status IN ('ASSIGNED', 'NEED_REPLACEMENT')
        """),
        {
            "teacher_id": payload.teacher_id,
            "class_date": target_class["class_date"],
        },
    ).scalar_one()

    if assigned_count >= teacher_row["max_slots_per_day"]:
        raise HTTPException(status_code=400, detail="replacement teacher exceeds max slots per day")

    db.execute(
        text("""
            UPDATE classes
            SET teacher_id = :teacher_id,
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

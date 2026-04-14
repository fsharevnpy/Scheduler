from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.routes.common import get_day_of_week_sql
from core.permissions import ROLE_DEVELOPER, ROLE_MANAGER, require_roles
from db import get_db
from schemas.auth import CurrentUser
from schemas.scheduling import AssignReplacementPayload


router = APIRouter()

ELO_WEIGHT = 0.3
EDUCATION_WEIGHT = 0.2
CENTER_MATCH_WEIGHT = 0.25
TIME_MATCH_WEIGHT = 0.25


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
            SELECT
                t.teacher_id,
                t.name,
                t.elo,
                COALESCE(t.education_score, 0) AS education_score,
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
              AND (:original_teacher_id IS NULL OR t.teacher_id <> :original_teacher_id)
              AND NOT EXISTS (
                  SELECT 1
                  FROM leave_requests lr
                  WHERE lr.teacher_id = t.teacher_id
                    AND lr.request_date = :class_date
                    AND lr.status IN ('REQUESTED', 'APPROVED')
              )
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
            FROM leave_requests
            WHERE teacher_id = :teacher_id
              AND request_date = :class_date
              AND status IN ('REQUESTED', 'APPROVED')
        """),
        {
            "teacher_id": payload.teacher_id,
            "class_date": target_class["class_date"],
        },
    ).first()

    if active_leave_request:
        raise HTTPException(status_code=400, detail="replacement teacher already has a leave request on that date")

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

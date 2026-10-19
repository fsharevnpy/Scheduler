from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.routes.common import VALID_CLASS_STATUS
from core.permissions import ROLE_DEVELOPER, ROLE_MANAGER, ROLE_TEACHER, get_current_user, require_roles
from db import get_db
from schemas.auth import CurrentUser
from schemas.scheduling import ClassCreate, ClassUpdate
from services.class_assignments import ensure_class_teacher_reassignment_overrides_table, ensure_class_teachers_table


router = APIRouter()


def generate_class_id(db: Session, center_id: str, day_of_week: str) -> str:
    prefix = f"CL_{center_id}_{day_of_week}_"
    rows = db.execute(
        text("""
            SELECT class_id
            FROM classes
            WHERE class_id LIKE :prefix_pattern
        """),
        {"prefix_pattern": f"{prefix}%"},
    ).scalars().all()

    max_sequence = 0
    for class_id in rows:
        suffix = class_id[len(prefix):]
        if suffix.isdigit():
            max_sequence = max(max_sequence, int(suffix))

    return f"{prefix}{max_sequence + 1}"


@router.get("/centers")
def get_centers(
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER, ROLE_TEACHER)),
):
    rows = db.execute(
        text("""
            SELECT center_id, name, room_count, latitude, longitude
            FROM centers
            ORDER BY center_id
        """)
    ).mappings().all()
    return [dict(row) for row in rows]


@router.get("/classes")
def get_classes(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    ensure_class_teachers_table(db)
    ensure_class_teacher_reassignment_overrides_table(db)
    query = """
        WITH active_teacher_overrides AS (
            SELECT class_id, original_teacher_id, replacement_teacher_id
            FROM class_teacher_reassignment_overrides
            WHERE effective_date <= CAST(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE)
              AND expires_on >= CAST(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE)
        ),
        assignment_rows AS (
            SELECT
                ct.class_id,
                COALESCE(override.replacement_teacher_id, ct.teacher_id) AS teacher_id,
                ct.teacher_id AS original_teacher_id,
                CASE WHEN override.replacement_teacher_id IS NULL THEN 'PERMANENT' ELSE 'TEMPORARY' END AS assignment_mode,
                ct.assigned_at
            FROM class_teachers ct
            LEFT JOIN active_teacher_overrides override
                ON override.class_id = ct.class_id
               AND override.original_teacher_id = ct.teacher_id
            UNION
            SELECT
                c.class_id,
                COALESCE(override.replacement_teacher_id, c.teacher_id) AS teacher_id,
                c.teacher_id AS original_teacher_id,
                CASE WHEN override.replacement_teacher_id IS NULL THEN 'PERMANENT' ELSE 'TEMPORARY' END AS assignment_mode,
                NOW()
            FROM classes c
            LEFT JOIN active_teacher_overrides override
                ON override.class_id = c.class_id
               AND override.original_teacher_id = c.teacher_id
            WHERE c.teacher_id IS NOT NULL
            UNION
            SELECT class_id, replacement_teacher_id, original_teacher_id, 'TEMPORARY', NOW()
            FROM active_teacher_overrides WHERE original_teacher_id = replacement_teacher_id
        ),
        distinct_assignments AS (
            SELECT DISTINCT ON (class_id, teacher_id) class_id, teacher_id, original_teacher_id, assignment_mode, assigned_at
            FROM assignment_rows
            ORDER BY class_id, teacher_id, CASE assignment_mode WHEN 'TEMPORARY' THEN 0 ELSE 1 END, assigned_at
        ),
        assignment_summary AS (
            SELECT
                da.class_id,
                ARRAY_AGG(da.teacher_id ORDER BY da.assigned_at, da.teacher_id) AS teacher_ids,
                ARRAY_AGG(CONCAT(da.teacher_id, ' - ', t.name) ORDER BY da.assigned_at, da.teacher_id) AS teacher_labels,
                ARRAY_AGG(da.assignment_mode ORDER BY da.assigned_at, da.teacher_id) AS teacher_assignment_modes,
                ARRAY_AGG(da.original_teacher_id ORDER BY da.assigned_at, da.teacher_id) AS original_teacher_ids,
                COUNT(*) AS teacher_count
            FROM distinct_assignments da
            JOIN teachers t ON t.teacher_id = da.teacher_id
            GROUP BY da.class_id
        )
        SELECT c.class_id, c.day_of_week, c.center_id, c.start_time, c.end_time,
               COALESCE((assignment_summary.teacher_ids)[1], c.teacher_id) AS teacher_id,
               COALESCE(assignment_summary.teacher_ids, ARRAY[]::VARCHAR[]) AS teacher_ids,
               COALESCE(assignment_summary.teacher_labels, ARRAY[]::TEXT[]) AS teacher_labels,
               COALESCE(assignment_summary.teacher_assignment_modes, ARRAY[]::TEXT[]) AS teacher_assignment_modes,
               COALESCE(assignment_summary.original_teacher_ids, ARRAY[]::VARCHAR[]) AS original_teacher_ids,
               COALESCE(assignment_summary.teacher_count, 0) AS teacher_count,
               CASE WHEN c.status = 'OPEN' AND COALESCE(assignment_summary.teacher_count, 0) > 0
                    THEN 'ASSIGNED' ELSE c.status END AS status,
               COALESCE((SELECT jsonb_agg(jsonb_build_object(
                   'teacher_id', o.replacement_teacher_id, 'teacher_name', t.name,
                   'original_teacher_id', o.original_teacher_id, 'effective_date', o.effective_date
               ) ORDER BY o.effective_date, t.name)
               FROM class_teacher_reassignment_overrides o
               JOIN teachers t ON t.teacher_id = o.replacement_teacher_id
               WHERE o.class_id = c.class_id
                 AND o.effective_date >= (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
               ), '[]'::jsonb) AS temporary_assignments
        FROM classes c
        LEFT JOIN assignment_summary ON assignment_summary.class_id = c.class_id
    """
    params = {}

    if current_user.role == ROLE_TEACHER:
        if not current_user.teacher_id:
            raise HTTPException(status_code=403, detail="teacher account is not linked")
        query += """
            WHERE :teacher_id = ANY(COALESCE(assignment_summary.teacher_ids, ARRAY[]::VARCHAR[]))
        """
        params["teacher_id"] = current_user.teacher_id

    query += """
        ORDER BY c.center_id,
        CASE c.day_of_week
            WHEN 'T2' THEN 1 WHEN 'T3' THEN 2 WHEN 'T4' THEN 3
            WHEN 'T5' THEN 4 WHEN 'T6' THEN 5 WHEN 'T7' THEN 6
            ELSE 7
        END, c.start_time
    """
    rows = db.execute(text(query), params).mappings().all()
    return [dict(row) for row in rows]


@router.post("/classes")
def create_class(
    payload: ClassCreate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    ensure_class_teachers_table(db)
    center_exists = db.execute(
        text("SELECT 1 FROM centers WHERE center_id = :center_id"),
        {"center_id": payload.center_id},
    ).first()

    if not center_exists:
        raise HTTPException(status_code=404, detail="center not found")

    if payload.start_time >= payload.end_time:
        raise HTTPException(status_code=400, detail="start time must be before end time")

    if payload.teacher_id:
        teacher_exists = db.execute(
            text("SELECT 1 FROM teachers WHERE teacher_id = :teacher_id"),
            {"teacher_id": payload.teacher_id},
        ).first()
        if not teacher_exists:
            raise HTTPException(status_code=404, detail="teacher not found")

    db.execute(text("LOCK TABLE classes IN SHARE ROW EXCLUSIVE MODE"))
    class_id = generate_class_id(db, payload.center_id, payload.day_of_week)
    data = payload.model_dump()
    data["class_id"] = class_id
    data["status"] = "ASSIGNED" if payload.teacher_id else "OPEN"

    db.execute(
        text("""
            INSERT INTO classes (
                class_id, day_of_week, center_id, start_time, end_time,
                teacher_id, status
            )
            VALUES (
                :class_id, :day_of_week, :center_id, :start_time, :end_time,
                :teacher_id, :status
            )
        """),
        data,
    )
    if payload.teacher_id:
        db.execute(
            text("""
                INSERT INTO class_teachers (class_id, teacher_id)
                VALUES (:class_id, :teacher_id)
                ON CONFLICT (class_id, teacher_id) DO NOTHING
            """),
            {"class_id": class_id, "teacher_id": payload.teacher_id},
        )
    db.commit()
    return {"message": "class created", "class_id": class_id}


@router.put("/classes/{class_id}")
def update_class(
    class_id: str,
    payload: ClassUpdate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    ensure_class_teachers_table(db)
    existing = db.execute(
        text("SELECT start_time, end_time FROM classes WHERE class_id = :class_id"),
        {"class_id": class_id},
    ).mappings().first()

    if not existing:
        raise HTTPException(status_code=404, detail="class not found")

    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="no fields provided")

    if "status" in data and data["status"] not in VALID_CLASS_STATUS:
        raise HTTPException(status_code=400, detail="invalid class status")

    if "center_id" in data:
        center_exists = db.execute(
            text("SELECT 1 FROM centers WHERE center_id = :center_id"),
            {"center_id": data["center_id"]},
        ).first()
        if not center_exists:
            raise HTTPException(status_code=404, detail="center not found")

    if "teacher_id" in data and data["teacher_id"] is not None:
        teacher_exists = db.execute(
            text("SELECT 1 FROM teachers WHERE teacher_id = :teacher_id"),
            {"teacher_id": data["teacher_id"]},
        ).first()
        if not teacher_exists:
            raise HTTPException(status_code=404, detail="teacher not found")

    next_start_time = data.get("start_time", existing["start_time"])
    next_end_time = data.get("end_time", existing["end_time"])
    if next_start_time >= next_end_time:
        raise HTTPException(status_code=400, detail="start time must be before end time")

    fields = ", ".join([f"{key} = :{key}" for key in data.keys()])
    data["class_id"] = class_id

    db.execute(text(f"UPDATE classes SET {fields} WHERE class_id = :class_id"), data)
    if "teacher_id" in data:
        db.execute(text("DELETE FROM class_teachers WHERE class_id = :class_id"), {"class_id": class_id})
        if data["teacher_id"] is not None:
            db.execute(
                text("""
                    INSERT INTO class_teachers (class_id, teacher_id)
                    VALUES (:class_id, :teacher_id)
                    ON CONFLICT (class_id, teacher_id) DO NOTHING
                """),
                {"class_id": class_id, "teacher_id": data["teacher_id"]},
            )
    db.commit()
    return {"message": "class updated", "class_id": class_id}


@router.delete("/classes/{class_id}")
def delete_class(
    class_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    existing = db.execute(
        text("SELECT 1 FROM classes WHERE class_id = :class_id"),
        {"class_id": class_id},
    ).first()

    if not existing:
        raise HTTPException(status_code=404, detail="class not found")

    db.execute(text("DELETE FROM classes WHERE class_id = :class_id"), {"class_id": class_id})
    db.commit()
    return {"message": "class deleted", "class_id": class_id}

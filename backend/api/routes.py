from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.permissions import (
    ROLE_DEVELOPER,
    ROLE_MANAGER,
    ROLE_TEACHER,
    get_current_user,
    require_roles,
    require_teacher_identity,
)
from db import get_db
from schemas.auth import CurrentUser
from schemas.scheduling import (
    AssignReplacementPayload,
    ClassCreate,
    ClassUpdate,
    LeaveRequestCreate,
    TeacherCreate,
    TeacherUpdate,
)


router = APIRouter()

VALID_CLASS_STATUS = {"OPEN", "ASSIGNED", "CANCELLED", "NEED_REPLACEMENT"}
VALID_LEAVE_STATUS = {"REQUESTED", "APPROVED", "CANCELLED"}


def get_day_of_week_sql() -> str:
    return """
        CASE
            WHEN EXTRACT(ISODOW FROM c.class_date) = 1 THEN 'T2'
            WHEN EXTRACT(ISODOW FROM c.class_date) = 2 THEN 'T3'
            WHEN EXTRACT(ISODOW FROM c.class_date) = 3 THEN 'T4'
            WHEN EXTRACT(ISODOW FROM c.class_date) = 4 THEN 'T5'
            WHEN EXTRACT(ISODOW FROM c.class_date) = 5 THEN 'T6'
            WHEN EXTRACT(ISODOW FROM c.class_date) = 6 THEN 'T7'
            ELSE 'CN'
        END
    """


@router.get("/")
def root():
    return {"message": "Backend is running"}


@router.get("/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as exc:
        return {"status": "error", "database": str(exc)}


@router.get("/teachers")
def get_teachers(
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    rows = db.execute(
        text("""
            SELECT teacher_id, name, contact, score, max_slots_per_day, active
            FROM teachers
            ORDER BY teacher_id
        """)
    ).mappings().all()
    return [dict(row) for row in rows]


@router.post("/teachers")
def create_teacher(
    payload: TeacherCreate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    existing = db.execute(
        text("SELECT 1 FROM teachers WHERE teacher_id = :teacher_id"),
        {"teacher_id": payload.teacher_id},
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="teacher_id already exists")

    db.execute(
        text("""
            INSERT INTO teachers (
                teacher_id, name, contact, score, max_slots_per_day, active
            )
            VALUES (
                :teacher_id, :name, :contact, :score, :max_slots_per_day, :active
            )
        """),
        payload.model_dump(),
    )
    db.commit()
    return {"message": "teacher created", "teacher_id": payload.teacher_id}


@router.put("/teachers/{teacher_id}")
def update_teacher(
    teacher_id: str,
    payload: TeacherUpdate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    existing = db.execute(
        text("SELECT 1 FROM teachers WHERE teacher_id = :teacher_id"),
        {"teacher_id": teacher_id},
    ).first()

    if not existing:
        raise HTTPException(status_code=404, detail="teacher not found")

    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="no fields provided")

    fields = ", ".join([f"{key} = :{key}" for key in data.keys()])
    data["teacher_id"] = teacher_id

    db.execute(text(f"UPDATE teachers SET {fields} WHERE teacher_id = :teacher_id"), data)
    db.commit()
    return {"message": "teacher updated", "teacher_id": teacher_id}


@router.get("/classes")
def get_classes(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    query = """
        SELECT class_id, class_date, center_id, start_time, end_time,
               room_no, teacher_id, status
        FROM classes
    """
    params = {}

    if current_user.role == ROLE_TEACHER:
        if not current_user.teacher_id:
            raise HTTPException(status_code=403, detail="teacher account is not linked")
        query += " WHERE teacher_id = :teacher_id"
        params["teacher_id"] = current_user.teacher_id

    query += " ORDER BY class_date, start_time"
    rows = db.execute(text(query), params).mappings().all()
    return [dict(row) for row in rows]


@router.post("/classes")
def create_class(
    payload: ClassCreate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    if payload.status not in VALID_CLASS_STATUS:
        raise HTTPException(status_code=400, detail="invalid class status")

    existing = db.execute(
        text("SELECT 1 FROM classes WHERE class_id = :class_id"),
        {"class_id": payload.class_id},
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="class_id already exists")

    center_exists = db.execute(
        text("SELECT 1 FROM centers WHERE center_id = :center_id"),
        {"center_id": payload.center_id},
    ).first()

    if not center_exists:
        raise HTTPException(status_code=404, detail="center not found")

    if payload.teacher_id:
        teacher_exists = db.execute(
            text("SELECT 1 FROM teachers WHERE teacher_id = :teacher_id"),
            {"teacher_id": payload.teacher_id},
        ).first()
        if not teacher_exists:
            raise HTTPException(status_code=404, detail="teacher not found")

    db.execute(
        text("""
            INSERT INTO classes (
                class_id, class_date, center_id, start_time, end_time,
                room_no, teacher_id, status
            )
            VALUES (
                :class_id, :class_date, :center_id, :start_time, :end_time,
                :room_no, :teacher_id, :status
            )
        """),
        payload.model_dump(),
    )
    db.commit()
    return {"message": "class created", "class_id": payload.class_id}


@router.put("/classes/{class_id}")
def update_class(
    class_id: str,
    payload: ClassUpdate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    existing = db.execute(
        text("SELECT 1 FROM classes WHERE class_id = :class_id"),
        {"class_id": class_id},
    ).first()

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

    fields = ", ".join([f"{key} = :{key}" for key in data.keys()])
    data["class_id"] = class_id

    db.execute(text(f"UPDATE classes SET {fields} WHERE class_id = :class_id"), data)
    db.commit()
    return {"message": "class updated", "class_id": class_id}


@router.get("/leave-requests")
def get_leave_requests(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    query = """
        SELECT request_id, class_id, teacher_id, request_date, status
        FROM leave_requests
    """
    params = {}

    if current_user.role == ROLE_TEACHER:
        if not current_user.teacher_id:
            raise HTTPException(status_code=403, detail="teacher account is not linked")
        query += " WHERE teacher_id = :teacher_id"
        params["teacher_id"] = current_user.teacher_id

    query += " ORDER BY request_date, request_id"
    rows = db.execute(text(query), params).mappings().all()
    return [dict(row) for row in rows]


@router.post("/leave-requests")
def create_leave_request(
    payload: LeaveRequestCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    if payload.status not in VALID_LEAVE_STATUS:
        raise HTTPException(status_code=400, detail="invalid leave request status")

    if current_user.role == ROLE_TEACHER:
        teacher_user = require_teacher_identity(current_user)
        if payload.teacher_id != teacher_user.teacher_id:
            raise HTTPException(status_code=403, detail="teachers can only create their own leave requests")
    elif current_user.role not in {ROLE_DEVELOPER, ROLE_MANAGER}:
        raise HTTPException(status_code=403, detail="forbidden")

    existing = db.execute(
        text("SELECT 1 FROM leave_requests WHERE request_id = :request_id"),
        {"request_id": payload.request_id},
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="request_id already exists")

    class_row = db.execute(
        text("""
            SELECT class_id, teacher_id, status
            FROM classes
            WHERE class_id = :class_id
        """),
        {"class_id": payload.class_id},
    ).mappings().first()

    if not class_row:
        raise HTTPException(status_code=404, detail="class not found")

    if class_row["teacher_id"] != payload.teacher_id:
        raise HTTPException(status_code=400, detail="teacher is not assigned to the class")

    db.execute(
        text("""
            INSERT INTO leave_requests (request_id, class_id, teacher_id, request_date, status)
            VALUES (:request_id, :class_id, :teacher_id, :request_date, :status)
        """),
        {
            "request_id": payload.request_id,
            "class_id": payload.class_id,
            "teacher_id": payload.teacher_id,
            "request_date": payload.request_date,
            "status": payload.status,
        },
    )

    db.execute(
        text("""
            UPDATE classes
            SET status = 'NEED_REPLACEMENT'
            WHERE class_id = :class_id
        """),
        {"class_id": payload.class_id},
    )

    db.commit()
    return {"message": "leave request created", "request_id": payload.request_id}


@router.put("/leave-requests/{request_id}/approve")
def approve_leave_request(
    request_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    leave_row = db.execute(
        text("""
            SELECT request_id, class_id, teacher_id, status
            FROM leave_requests
            WHERE request_id = :request_id
        """),
        {"request_id": request_id},
    ).mappings().first()

    if not leave_row:
        raise HTTPException(status_code=404, detail="leave request not found")

    if leave_row["status"] == "APPROVED":
        return {"message": "leave request already approved", "request_id": request_id}

    if leave_row["status"] == "CANCELLED":
        raise HTTPException(status_code=400, detail="cannot approve a cancelled leave request")

    db.execute(
        text("""
            UPDATE leave_requests
            SET status = 'APPROVED'
            WHERE request_id = :request_id
        """),
        {"request_id": request_id},
    )

    db.execute(
        text("""
            UPDATE classes
            SET status = 'NEED_REPLACEMENT'
            WHERE class_id = :class_id
        """),
        {"class_id": leave_row["class_id"]},
    )

    db.commit()
    return {"message": "leave request approved", "request_id": request_id}


@router.put("/leave-requests/{request_id}/cancel")
def cancel_leave_request(
    request_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    leave_row = db.execute(
        text("""
            SELECT request_id, class_id, status
            FROM leave_requests
            WHERE request_id = :request_id
        """),
        {"request_id": request_id},
    ).mappings().first()

    if not leave_row:
        raise HTTPException(status_code=404, detail="leave request not found")

    if leave_row["status"] == "CANCELLED":
        return {"message": "leave request already cancelled", "request_id": request_id}

    db.execute(
        text("""
            UPDATE leave_requests
            SET status = 'CANCELLED'
            WHERE request_id = :request_id
        """),
        {"request_id": request_id},
    )

    db.commit()
    return {"message": "leave request cancelled", "request_id": request_id}


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

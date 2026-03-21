from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.routes.common import VALID_CLASS_STATUS
from core.permissions import ROLE_DEVELOPER, ROLE_MANAGER, ROLE_TEACHER, get_current_user, require_roles
from db import get_db
from schemas.auth import CurrentUser
from schemas.scheduling import ClassCreate, ClassUpdate


router = APIRouter()


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

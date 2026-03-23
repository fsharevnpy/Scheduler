from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.permissions import ROLE_DEVELOPER, ROLE_MANAGER, require_roles
from db import get_db
from schemas.auth import CurrentUser
from schemas.scheduling import TeacherUpdate


router = APIRouter()


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

    if "name" in data:
        db.execute(
            text("""
                UPDATE users
                SET display_name = :display_name
                WHERE teacher_id = :teacher_id
            """),
            {
                "display_name": data["name"],
                "teacher_id": teacher_id,
            },
        )

    db.commit()
    return {"message": "teacher updated", "teacher_id": teacher_id}

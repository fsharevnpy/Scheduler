from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.object_storage import remove_profile_image
from core.profile_images import build_profile_image_url
from core.permissions import ROLE_DEVELOPER, ROLE_MANAGER, ROLE_TEACHER, require_roles
from db import get_db
from schemas.auth import CurrentUser
from schemas.scheduling import TeacherUpdate
from services.teacher_events import create_teacher_profile_event, ensure_teacher_events_table


router = APIRouter()


def is_managed_profile_image_path(path: str | None) -> bool:
    return bool(path) and not path.startswith("http://") and not path.startswith("https://")


@router.get("/teachers")
def get_teachers(
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    rows = db.execute(
        text("""
            SELECT
                t.teacher_id,
                t.name,
                t.contact,
                t.email,
                t.elo,
                t.education_score,
                t.max_slots_per_day,
                t.active,
                u.user_code,
                u.profile_image_url
            FROM teachers t
            LEFT JOIN users u ON u.teacher_id = t.teacher_id AND u.role = 'teacher'
            ORDER BY t.teacher_id
        """)
    ).mappings().all()
    return [{**dict(row), "profile_image_url": build_profile_image_url(row["profile_image_url"])} for row in rows]


@router.get("/teachers/me")
def get_my_teacher_profile(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_roles(ROLE_TEACHER)),
):
    if not current_user.teacher_id:
        raise HTTPException(status_code=404, detail="teacher profile not linked")

    row = db.execute(
        text("""
            SELECT
                t.teacher_id,
                t.name,
                t.contact,
                t.email,
                t.elo,
                t.education_score,
                t.max_slots_per_day,
                t.active,
                u.profile_image_url
            FROM teachers t
            LEFT JOIN users u ON u.teacher_id = t.teacher_id AND u.role = 'teacher'
            WHERE t.teacher_id = :teacher_id
        """),
        {"teacher_id": current_user.teacher_id},
    ).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="teacher profile not found")

    return {**dict(row), "profile_image_url": build_profile_image_url(row["profile_image_url"])}


@router.put("/teachers/{teacher_id}")
def update_teacher(
    teacher_id: str,
    payload: TeacherUpdate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    existing = db.execute(
        text("""
            SELECT teacher_id, elo, education_score, max_slots_per_day
            FROM teachers
            WHERE teacher_id = :teacher_id
        """),
        {"teacher_id": teacher_id},
    ).mappings().first()

    if not existing:
        raise HTTPException(status_code=404, detail="teacher not found")

    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="no fields provided")

    fields = ", ".join([f"{key} = :{key}" for key in data.keys()])
    data["teacher_id"] = teacher_id

    db.execute(text(f"UPDATE teachers SET {fields} WHERE teacher_id = :teacher_id"), data)

    profile_notification_fields = {"elo", "education_score", "max_slots_per_day"}
    changed_profile_fields = [
        key
        for key in data.keys()
        if key in profile_notification_fields and existing[key] != data[key]
    ]
    if changed_profile_fields:
        ensure_teacher_events_table(db)
        for field in changed_profile_fields:
            create_teacher_profile_event(
                db,
                teacher_id=teacher_id,
                field=field,
                old_value=existing[field],
                new_value=data[field],
                created_by=current_user.user_code,
            )

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

    if "active" in data:
        db.execute(
            text("""
                UPDATE users
                SET active = :active
                WHERE teacher_id = :teacher_id
            """),
            {
                "active": data["active"],
                "teacher_id": teacher_id,
            },
        )

    db.commit()
    return {"message": "teacher updated", "teacher_id": teacher_id}


@router.delete("/teachers/{teacher_id}/profile-image")
def delete_teacher_profile_image(
    teacher_id: str,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    user = db.execute(
        text("""
            SELECT user_code, profile_image_url
            FROM users
            WHERE teacher_id = :teacher_id
              AND role = 'teacher'
            LIMIT 1
        """),
        {"teacher_id": teacher_id},
    ).mappings().first()

    if not user:
        raise HTTPException(status_code=404, detail="teacher user not found")

    db.execute(
        text("""
            UPDATE users
            SET profile_image_url = NULL
            WHERE user_code = :user_code
        """),
        {"user_code": user["user_code"]},
    )
    db.commit()

    if is_managed_profile_image_path(user["profile_image_url"]):
        try:
            remove_profile_image(user["profile_image_url"])
        except Exception:
            pass

    return {
        "message": "teacher profile image deleted",
        "teacher_id": teacher_id,
        "profile_image_url": None,
    }

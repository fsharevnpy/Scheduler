from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.routes.common import get_manageable_roles
from core.permissions import ROLE_DEVELOPER, ROLE_MANAGER, ROLE_TEACHER, require_roles
from core.profile_images import build_profile_image_url
from core.security import hash_password
from db import get_db
from schemas.auth import CurrentUser, UserCreate


router = APIRouter()
DEFAULT_NEW_USER_PASSWORD = "123456aA@"


def get_target_user(user_code: str, db: Session):
    return db.execute(
        text("""
            SELECT user_id, user_code, display_name, profile_image_url, role, teacher_id, active
            FROM users
            WHERE user_code = :user_code
        """),
        {"user_code": user_code},
    ).mappings().first()


def generate_user_code(db: Session) -> str:
    prefix = datetime.now().strftime("%y%m")
    latest_user_code = db.execute(
        text("""
            SELECT user_code
            FROM users
            WHERE user_code LIKE :prefix
            ORDER BY user_code DESC
            LIMIT 1
        """),
        {"prefix": f"{prefix}%"},
    ).scalar_one_or_none()

    next_sequence = 0
    if latest_user_code:
        next_sequence = int(str(latest_user_code)[-3:]) + 1

    if next_sequence > 999:
        raise HTTPException(status_code=400, detail="monthly user code limit reached")

    return f"{prefix}{next_sequence:03d}"


def generate_teacher_id(db: Session) -> str:
    latest_sequence = db.execute(
        text("""
            SELECT COALESCE(MAX(CAST(SUBSTRING(teacher_id FROM 3) AS INT)), -1)
            FROM teachers
            WHERE teacher_id ~ '^GV[0-9]+$'
        """)
    ).scalar_one()
    return f"GV{latest_sequence + 1}"


@router.get("/users")
def get_users(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    allowed_roles = get_manageable_roles(current_user)
    placeholders = ", ".join([f":role_{index}" for index in range(len(allowed_roles))])
    params = {f"role_{index}": role for index, role in enumerate(allowed_roles)}

    rows = db.execute(
        text(f"""
            SELECT user_id, user_code, display_name, profile_image_url, role, teacher_id, active
            FROM users
            WHERE role IN ({placeholders})
            ORDER BY role, user_code
        """),
        params,
    ).mappings().all()
    return [{**dict(row), "profile_image_url": build_profile_image_url(row["profile_image_url"])} for row in rows]


@router.post("/users", response_model=CurrentUser)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    allowed_roles = get_manageable_roles(current_user)
    if payload.role not in allowed_roles:
        raise HTTPException(status_code=403, detail="forbidden to create this role")

    if payload.role == ROLE_TEACHER:
        for preference in payload.preferences:
            center_exists = db.execute(
                text("SELECT 1 FROM centers WHERE center_id = :center_id"),
                {"center_id": preference.preferred_center_id},
            ).first()
            if not center_exists:
                raise HTTPException(status_code=404, detail=f"center not found: {preference.preferred_center_id}")

        teacher_id = generate_teacher_id(db)
        display_name = payload.name
        password = DEFAULT_NEW_USER_PASSWORD

        db.execute(
            text("""
                INSERT INTO teachers (
                    teacher_id, name, contact, score, max_slots_per_day, active
                )
                VALUES (
                    :teacher_id, :name, :contact, :score, :max_slots_per_day, :active
                )
            """),
            {
                "teacher_id": teacher_id,
                "name": payload.name,
                "contact": payload.contact,
                "score": payload.score,
                "max_slots_per_day": payload.max_slots_per_day,
                "active": payload.active,
            },
        )

        for preference in payload.preferences:
            db.execute(
                text("""
                    INSERT INTO teacher_preferences (
                        teacher_id, preferred_center_id, day_of_week,
                        preferred_start_time, preferred_end_time
                    )
                    VALUES (
                        :teacher_id, :preferred_center_id, :day_of_week,
                        :preferred_start_time, :preferred_end_time
                    )
                """),
                {
                    "teacher_id": teacher_id,
                    "preferred_center_id": preference.preferred_center_id,
                    "day_of_week": preference.day_of_week,
                    "preferred_start_time": preference.preferred_start_time,
                    "preferred_end_time": preference.preferred_end_time,
                },
            )
    else:
        teacher_id = None
        display_name = payload.display_name
        password = DEFAULT_NEW_USER_PASSWORD

    user_id = uuid4()
    user_code = generate_user_code(db)
    db.execute(
        text("""
            INSERT INTO users (user_id, user_code, display_name, profile_image_url, password_hash, role, teacher_id, active)
            VALUES (:user_id, :user_code, :display_name, :profile_image_url, :password_hash, :role, :teacher_id, :active)
        """),
        {
            "user_id": str(user_id),
            "user_code": user_code,
            "display_name": display_name,
            "profile_image_url": None,
            "password_hash": hash_password(password),
            "role": payload.role,
            "teacher_id": teacher_id,
            "active": payload.active,
        },
    )
    db.commit()

    return CurrentUser(
        user_id=user_id,
        user_code=user_code,
        display_name=display_name,
        profile_image_url=None,
        role=payload.role,
        teacher_id=teacher_id,
        active=payload.active,
    )


@router.delete("/users/{user_code}")
def delete_user(
    user_code: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    target_user = get_target_user(user_code, db)

    if not target_user:
        raise HTTPException(status_code=404, detail="user not found")

    allowed_roles = get_manageable_roles(current_user)
    if target_user["role"] not in allowed_roles:
        raise HTTPException(status_code=403, detail="forbidden to delete this role")

    if target_user["user_code"] == current_user.user_code:
        raise HTTPException(status_code=400, detail="cannot delete current user")

    db.execute(text("DELETE FROM users WHERE user_code = :user_code"), {"user_code": user_code})
    db.commit()
    return {"message": "user deleted", "user_code": user_code}

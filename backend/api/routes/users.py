from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.routes.common import get_manageable_roles
from core.permissions import ROLE_DEVELOPER, ROLE_MANAGER, ROLE_TEACHER, require_roles
from core.security import hash_password
from db import get_db
from schemas.auth import CurrentUser, PasswordResetRequest, UserCreate


router = APIRouter()


def get_target_user(username: str, db: Session):
    return db.execute(
        text("""
            SELECT user_id, username, role, teacher_id, active
            FROM users
            WHERE username = :username
        """),
        {"username": username},
    ).mappings().first()


@router.post("/users", response_model=CurrentUser)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    allowed_roles = get_manageable_roles(current_user)
    if payload.role not in allowed_roles:
        raise HTTPException(status_code=403, detail="forbidden to create this role")

    existing = db.execute(
        text("SELECT 1 FROM users WHERE username = :username"),
        {"username": payload.username},
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="username already exists")

    if payload.role == ROLE_TEACHER:
        if not payload.teacher_id:
            raise HTTPException(status_code=400, detail="teacher_id is required for teacher role")
    elif payload.teacher_id is not None:
        raise HTTPException(status_code=400, detail="teacher_id is only allowed for teacher role")

    if payload.teacher_id:
        teacher_exists = db.execute(
            text("SELECT 1 FROM teachers WHERE teacher_id = :teacher_id"),
            {"teacher_id": payload.teacher_id},
        ).first()
        if not teacher_exists:
            raise HTTPException(status_code=404, detail="teacher not found")

        teacher_user_exists = db.execute(
            text("SELECT 1 FROM users WHERE teacher_id = :teacher_id"),
            {"teacher_id": payload.teacher_id},
        ).first()
        if teacher_user_exists:
            raise HTTPException(status_code=400, detail="teacher already linked to another user")

    user_id = uuid4()
    db.execute(
        text("""
            INSERT INTO users (user_id, username, password_hash, role, teacher_id, active)
            VALUES (:user_id, :username, :password_hash, :role, :teacher_id, :active)
        """),
        {
            "user_id": str(user_id),
            "username": payload.username,
            "password_hash": hash_password(payload.password),
            "role": payload.role,
            "teacher_id": payload.teacher_id,
            "active": payload.active,
        },
    )
    db.commit()

    return CurrentUser(
        user_id=user_id,
        username=payload.username,
        role=payload.role,
        teacher_id=payload.teacher_id,
        active=payload.active,
    )


@router.delete("/users/{username}")
def delete_user(
    username: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    target_user = get_target_user(username, db)

    if not target_user:
        raise HTTPException(status_code=404, detail="user not found")

    allowed_roles = get_manageable_roles(current_user)
    if target_user["role"] not in allowed_roles:
        raise HTTPException(status_code=403, detail="forbidden to delete this role")

    if target_user["username"] == current_user.username:
        raise HTTPException(status_code=400, detail="cannot delete current user")

    db.execute(text("DELETE FROM users WHERE username = :username"), {"username": username})
    db.commit()
    return {"message": "user deleted", "username": username}


@router.put("/users/{username}/reset-password")
def reset_user_password(
    username: str,
    payload: PasswordResetRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    target_user = get_target_user(username, db)
    if not target_user:
        raise HTTPException(status_code=404, detail="user not found")

    allowed_roles = get_manageable_roles(current_user)
    if target_user["role"] not in allowed_roles:
        raise HTTPException(status_code=403, detail="forbidden to reset password for this role")

    db.execute(
        text("""
            UPDATE users
            SET password_hash = :password_hash
            WHERE username = :username
        """),
        {
            "password_hash": hash_password(payload.new_password),
            "username": username,
        },
    )

    db.execute(
        text("""
            UPDATE password_reset_requests
            SET status = 'RESOLVED',
                resolution_note = COALESCE(resolution_note, 'Password reset completed internally'),
                resolved_by = :resolved_by,
                resolved_at = NOW()
            WHERE username = :username
              AND status = 'REQUESTED'
        """),
        {
            "resolved_by": current_user.username,
            "username": username,
        },
    )
    db.commit()
    return {"message": "password reset", "username": username}

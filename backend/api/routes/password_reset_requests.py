from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.routes.common import get_manageable_roles
from core.permissions import ROLE_DEVELOPER, ROLE_MANAGER, ROLE_TEACHER, get_current_user, require_roles
from core.profile_images import build_profile_image_url
from core.security import hash_password
from db import get_db
from schemas.auth import CurrentUser, PasswordResetRequestCreate


router = APIRouter()
DEFAULT_RESET_PASSWORD = "123456aA@"


def get_password_reset_request(request_id: str, db: Session):
    return db.execute(
        text("""
            SELECT
                pr.request_id,
                pr.user_code,
                u.display_name,
                u.profile_image_url,
                pr.status,
                pr.request_note,
                pr.resolution_note,
                pr.created_at,
                pr.resolved_by,
                pr.resolved_at,
                u.role AS user_role
            FROM password_reset_requests pr
            JOIN users u ON u.user_code = pr.user_code
            WHERE pr.request_id = :request_id
        """),
        {"request_id": request_id},
    ).mappings().first()


@router.post("/password-reset-requests")
def create_password_reset_request(
    payload: PasswordResetRequestCreate,
    db: Session = Depends(get_db),
):
    user = db.execute(
        text("""
            SELECT user_code, active
            FROM users
            WHERE user_code = :user_code
        """),
        {"user_code": payload.user_code},
    ).mappings().first()

    if not user:
        raise HTTPException(status_code=404, detail="user not found")

    if not user["active"]:
        raise HTTPException(status_code=400, detail="user is inactive")

    existing_request = db.execute(
        text("""
            SELECT request_id
            FROM password_reset_requests
            WHERE user_code = :user_code
              AND status = 'REQUESTED'
        """),
        {"user_code": payload.user_code},
    ).mappings().first()

    if existing_request:
        raise HTTPException(status_code=400, detail="active password reset request already exists")

    request_id = str(uuid4())
    db.execute(
        text("""
            INSERT INTO password_reset_requests (
                request_id, user_code, status, request_note
            )
            VALUES (
                :request_id, :user_code, 'REQUESTED', :request_note
            )
        """),
        {
            "request_id": request_id,
            "user_code": payload.user_code,
            "request_note": payload.request_note,
        },
    )
    db.commit()
    return {
        "message": "password reset request created",
        "request_id": request_id,
        "user_code": payload.user_code,
    }


@router.get("/password-reset-requests")
def get_password_reset_requests(
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    query = """
        SELECT
            pr.request_id,
            pr.user_code,
            u.display_name,
            u.profile_image_url,
            pr.status,
            pr.request_note,
            pr.resolution_note,
            pr.created_at,
            pr.resolved_by,
            pr.resolved_at
        FROM password_reset_requests pr
        JOIN users u ON u.user_code = pr.user_code
    """
    params = {}

    if current_user.role == ROLE_TEACHER:
        query += " WHERE pr.user_code = :user_code"
        params["user_code"] = current_user.user_code
    elif current_user.role in {ROLE_DEVELOPER, ROLE_MANAGER}:
        manageable_roles = tuple(get_manageable_roles(current_user))
        placeholders = ", ".join([f":role_{index}" for index in range(len(manageable_roles))])
        query += f" WHERE u.role IN ({placeholders})"
        for index, role in enumerate(manageable_roles):
            params[f"role_{index}"] = role
    else:
        raise HTTPException(status_code=403, detail="forbidden")

    query += " ORDER BY pr.created_at DESC"
    rows = db.execute(text(query), params).mappings().all()
    return [{**dict(row), "profile_image_url": build_profile_image_url(row["profile_image_url"])} for row in rows]


@router.put("/password-reset-requests/{request_id}/reset-default")
def reset_password_from_request(
    request_id: str,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(require_roles(ROLE_DEVELOPER, ROLE_MANAGER)),
):
    target_request = get_password_reset_request(request_id, db)
    if not target_request:
        raise HTTPException(status_code=404, detail="password reset request not found")

    if target_request["status"] != "REQUESTED":
        raise HTTPException(status_code=400, detail="password reset request is already processed")

    allowed_roles = get_manageable_roles(current_user)
    if target_request["user_role"] not in allowed_roles:
        raise HTTPException(status_code=403, detail="forbidden to reset password for this role")

    db.execute(
        text("""
            UPDATE users
            SET password_hash = :password_hash
            WHERE user_code = :user_code
        """),
        {
            "password_hash": hash_password(DEFAULT_RESET_PASSWORD),
            "user_code": target_request["user_code"],
        },
    )

    db.execute(
        text("""
            UPDATE password_reset_requests
            SET status = 'RESOLVED',
                resolution_note = :resolution_note,
                resolved_by = :resolved_by,
                resolved_at = NOW()
            WHERE request_id = :request_id
        """),
        {
            "resolution_note": "Password reset to default password",
            "resolved_by": current_user.user_code,
            "request_id": request_id,
        },
    )
    db.commit()
    return {
        "message": "password reset to default completed",
        "request_id": request_id,
        "status": "RESOLVED",
        "default_password": DEFAULT_RESET_PASSWORD,
    }

from typing import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.security import decode_access_token
from db import get_db
from schemas.auth import CurrentUser


ROLE_DEVELOPER = "developer"
ROLE_MANAGER = "manager"
ROLE_TEACHER = "teacher"

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing authorization token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(credentials.credentials)
    user = db.execute(
        text("""
            SELECT user_id, user_code, display_name, role, teacher_id, active
            FROM users
            WHERE user_code = :user_code
        """),
        {"user_code": payload["sub"]},
    ).mappings().first()

    if not user or not user["active"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="user is inactive or not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return CurrentUser(**dict(user))


def require_roles(*allowed_roles: str) -> Callable:
    def checker(current_user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if current_user.role not in allowed_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
        return current_user

    return checker


def require_teacher_identity(current_user: CurrentUser) -> CurrentUser:
    if current_user.role != ROLE_TEACHER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="teacher role required")

    if not current_user.teacher_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="teacher account is not linked to a teacher record",
        )

    return current_user

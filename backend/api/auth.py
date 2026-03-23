from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.permissions import get_current_user
from core.security import ACCESS_TOKEN_EXPIRE_MINUTES, create_access_token, hash_password, verify_password
from db import get_db
from schemas.auth import ChangePasswordRequest, CurrentUser, LoginRequest, TokenResponse


router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.execute(
        text("""
            SELECT user_id, user_code, display_name, password_hash, role, teacher_id, active
            FROM users
            WHERE user_code = :user_code
        """),
        {"user_code": payload.user_code},
    ).mappings().first()

    invalid_credentials = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="invalid user code or password",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not user or not user["active"]:
        raise invalid_credentials

    if not verify_password(payload.password, user["password_hash"]):
        raise invalid_credentials

    current_user = CurrentUser(
        user_id=user["user_id"],
        user_code=user["user_code"],
        display_name=user["display_name"],
        role=user["role"],
        teacher_id=user["teacher_id"],
        active=user["active"],
    )

    access_token = create_access_token(
        {
            "sub": current_user.user_code,
            "role": current_user.role,
            "teacher_id": current_user.teacher_id,
        }
    )
    return TokenResponse(
        access_token=access_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=current_user,
    )


@router.get("/me", response_model=CurrentUser)
def get_me(current_user: CurrentUser = Depends(get_current_user)):
    return current_user


@router.put("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user),
):
    user = db.execute(
        text("""
            SELECT user_code, password_hash, active
            FROM users
            WHERE user_code = :user_code
        """),
        {"user_code": current_user.user_code},
    ).mappings().first()

    if not user or not user["active"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or inactive user",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not verify_password(payload.current_password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="current password is incorrect")

    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="new password must be different from current password")

    db.execute(
        text("""
            UPDATE users
            SET password_hash = :password_hash
            WHERE user_code = :user_code
        """),
        {
            "password_hash": hash_password(payload.new_password),
            "user_code": current_user.user_code,
        },
    )
    db.commit()
    return {"message": "password changed", "user_code": current_user.user_code}

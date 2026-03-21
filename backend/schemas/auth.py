import re
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, field_validator


Role = Literal["developer", "manager", "teacher"]
SPECIAL_CHAR_PATTERN = r"[!@#$%^&*()_\-+=\[{\]};:'\",.<>/?\\|`~]"


def validate_password_policy(value: str) -> str:
    if len(value) < 8:
        raise ValueError("password must be at least 8 characters")
    if not re.search(r"[A-Z]", value):
        raise ValueError("password must include at least one uppercase letter")
    if not re.search(r"[a-z]", value):
        raise ValueError("password must include at least one lowercase letter")
    if not re.search(r"\d", value):
        raise ValueError("password must include at least one number")
    if not re.search(SPECIAL_CHAR_PATTERN, value):
        raise ValueError("password must include at least one special character")
    return value


class LoginRequest(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str
    password: str
    role: Role
    teacher_id: Optional[str] = None
    active: bool = True

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return validate_password_policy(value)


class PasswordResetRequest(BaseModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        return validate_password_policy(value)


class CurrentUser(BaseModel):
    user_id: UUID
    username: str
    role: Role
    teacher_id: Optional[str] = None
    active: bool = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: CurrentUser

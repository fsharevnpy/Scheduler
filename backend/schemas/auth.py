from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel


Role = Literal["developer", "manager", "teacher"]


class LoginRequest(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str
    password: str
    role: Role
    teacher_id: Optional[str] = None
    active: bool = True


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

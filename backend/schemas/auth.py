import re
from datetime import time
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


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
    user_code: str
    password: str


class TeacherPreferenceInput(BaseModel):
    preferred_center_id: str
    day_of_week: Literal["T2", "T3", "T4", "T5", "T6", "T7", "CN"]
    preferred_start_time: time
    preferred_end_time: time

    @model_validator(mode="after")
    def validate_time_range(self):
        if self.preferred_start_time >= self.preferred_end_time:
            raise ValueError("preferred_start_time must be earlier than preferred_end_time")
        return self


class UserCreate(BaseModel):
    display_name: Optional[str] = None
    role: Role
    teacher_id: Optional[str] = None
    name: Optional[str] = None
    contact: Optional[str] = None
    score: int = 0
    max_slots_per_day: int = 2
    preferences: list[TeacherPreferenceInput] = Field(default_factory=list)
    active: bool = True

    @field_validator("display_name")
    @classmethod
    def validate_display_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("display_name is required")
        if len(value) > 100:
            raise ValueError("display_name must be at most 100 characters")
        return value

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("name is required")
        if len(value) > 100:
            raise ValueError("name must be at most 100 characters")
        return value

    @field_validator("contact")
    @classmethod
    def validate_contact(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("contact is required")
        if len(value) > 50:
            raise ValueError("contact must be at most 50 characters")
        return value

    @model_validator(mode="after")
    def validate_role_specific_fields(self):
        if self.role == "teacher":
            if self.teacher_id is not None:
                raise ValueError("teacher_id is generated automatically for teacher role")
            if self.display_name is not None:
                raise ValueError("display_name is synced automatically for teacher role")
            if not self.name:
                raise ValueError("name is required for teacher role")
            if not self.contact:
                raise ValueError("contact is required for teacher role")
        else:
            if self.teacher_id is not None:
                raise ValueError("teacher_id is only allowed for teacher role")
            if self.name is not None:
                raise ValueError("name is only allowed for teacher role")
            if self.contact is not None:
                raise ValueError("contact is only allowed for teacher role")
            if self.preferences:
                raise ValueError("preferences are only allowed for teacher role")
            if self.display_name is None:
                raise ValueError("display_name is required")

        if self.max_slots_per_day <= 0:
            raise ValueError("max_slots_per_day must be greater than 0")

        return self


class PasswordResetRequestCreate(BaseModel):
    user_code: str
    request_note: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        return validate_password_policy(value)

    @model_validator(mode="after")
    def validate_password_confirmation(self):
        if self.new_password != self.confirm_new_password:
            raise ValueError("confirm_new_password must match new_password")
        return self


class CurrentUser(BaseModel):
    user_id: UUID
    user_code: str
    display_name: str
    role: Role
    teacher_id: Optional[str] = None
    active: bool = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: CurrentUser

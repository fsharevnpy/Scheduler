from datetime import date, time
from typing import Optional

from pydantic import BaseModel, field_validator


class TeacherUpdate(BaseModel):
    name: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[str] = None
    elo: Optional[int] = None
    education_score: Optional[float] = None
    max_slots_per_day: Optional[int] = None
    active: Optional[bool] = None

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

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("email is required")
        if len(value) > 100:
            raise ValueError("email must be at most 100 characters")
        if "@" not in value:
            raise ValueError("email must be valid")
        return value

    @field_validator("elo")
    @classmethod
    def validate_elo(cls, value: Optional[int]) -> Optional[int]:
        if value is None:
            return value
        if value < 0:
            raise ValueError("elo must be at least 0")
        return value

    @field_validator("education_score")
    @classmethod
    def validate_education_score(cls, value: Optional[float]) -> Optional[float]:
        if value is None:
            return value
        if value < 0 or value > 10:
            raise ValueError("education_score must be between 0 and 10")
        return value


class ClassCreate(BaseModel):
    class_id: str
    class_date: date
    center_id: str
    start_time: time
    end_time: time
    room_no: int
    teacher_id: Optional[str] = None
    status: str = "OPEN"


class ClassUpdate(BaseModel):
    class_date: Optional[date] = None
    center_id: Optional[str] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    room_no: Optional[int] = None
    teacher_id: Optional[str] = None
    status: Optional[str] = None


class LeaveRequestCreate(BaseModel):
    request_id: str
    class_id: str
    teacher_id: str
    request_date: date
    reason: str
    status: str = "REQUESTED"

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("reason is required")
        return value


class AssignReplacementPayload(BaseModel):
    teacher_id: str


class AttendanceCheckInPayload(BaseModel):
    latitude: float
    longitude: float
    accuracy_meters: Optional[float] = None

    @field_validator("latitude")
    @classmethod
    def validate_latitude(cls, value: float) -> float:
        if value < -90 or value > 90:
            raise ValueError("latitude must be between -90 and 90")
        return value

    @field_validator("longitude")
    @classmethod
    def validate_longitude(cls, value: float) -> float:
        if value < -180 or value > 180:
            raise ValueError("longitude must be between -180 and 180")
        return value

    @field_validator("accuracy_meters")
    @classmethod
    def validate_accuracy(cls, value: Optional[float]) -> Optional[float]:
        if value is None:
            return value
        if value < 0:
            raise ValueError("accuracy_meters must be at least 0")
        return value

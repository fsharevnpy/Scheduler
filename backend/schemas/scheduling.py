from datetime import date, time
from typing import Optional

from pydantic import BaseModel, field_validator


class TeacherCreate(BaseModel):
    teacher_id: str
    name: str
    contact: Optional[str] = None
    score: int = 0
    max_slots_per_day: int = 2
    active: bool = True


class TeacherUpdate(BaseModel):
    name: Optional[str] = None
    contact: Optional[str] = None
    score: Optional[int] = None
    max_slots_per_day: Optional[int] = None
    active: Optional[bool] = None


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

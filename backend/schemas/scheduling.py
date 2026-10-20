from datetime import date, datetime, time
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


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

    @field_validator("max_slots_per_day")
    @classmethod
    def validate_max_slots_per_day(cls, value: Optional[int]) -> Optional[int]:
        if value is None:
            return value
        if value <= 0:
            raise ValueError("max_slots_per_day must be greater than 0")
        return value


class ClassCreate(BaseModel):
    class_id: Optional[str] = None
    day_of_week: Literal["T2", "T3", "T4", "T5", "T6", "T7", "CN"]
    center_id: str
    start_time: time
    end_time: time
    teacher_id: Optional[str] = None


class ClassUpdate(BaseModel):
    day_of_week: Optional[Literal["T2", "T3", "T4", "T5", "T6", "T7", "CN"]] = None
    center_id: Optional[str] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    teacher_id: Optional[str] = None
    status: Optional[str] = None


class LeaveRequestCreate(BaseModel):
    request_id: str
    class_id: str
    teacher_id: str
    assigned_manager_code: str
    request_date: date
    reason: str
    status: str = "REQUESTED"

    @field_validator("assigned_manager_code")
    @classmethod
    def validate_assigned_manager_code(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("assigned_manager_code is required")
        return value

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("reason is required")
        return value


class AssignReplacementPayload(BaseModel):
    teacher_id: str
    mode: str = "PERMANENT"
    effective_date: Optional[date] = None

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, value: str) -> str:
        normalized = value.strip().upper()
        if normalized not in {"TEMPORARY", "PERMANENT"}:
            raise ValueError("mode must be TEMPORARY or PERMANENT")
        return normalized


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


class AttendanceStudentsPayload(BaseModel):
    student_count: int = Field(strict=True, gt=0)
    student_names: list[str]

    @field_validator("student_names")
    @classmethod
    def validate_student_names(cls, names: list[str]) -> list[str]:
        names = [name.strip() for name in names]
        if any(not name or len(name) > 150 or any(ord(char) < 32 or ord(char) == 127 for char in name) for name in names):
            raise ValueError("each student name must contain 1 to 150 characters on one line")
        return names

    @model_validator(mode="after")
    def validate_student_count(self) -> "AttendanceStudentsPayload":
        if len(self.student_names) != self.student_count:
            raise ValueError("student count must match the number of names")
        if len("\n".join(self.student_names)) > 32767:
            raise ValueError("student list exceeds the report cell text limit")
        return self


class SessionStudentsPayload(AttendanceStudentsPayload):
    class_id: str = Field(min_length=1)


class CheckoutStudentsPayload(BaseModel):
    student_count: Optional[int] = Field(default=None, strict=True, gt=0)
    student_names: Optional[list[str]] = None
    session_students: Optional[list[SessionStudentsPayload]] = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def validate_rosters(self) -> "CheckoutStudentsPayload":
        if self.session_students is not None:
            if self.student_count is not None or self.student_names is not None:
                raise ValueError("use either session students or a single student list")
            ids = [item.class_id for item in self.session_students]
            if len(set(ids)) != len(ids):
                raise ValueError("each teaching session must have one student list")
        else:
            if self.student_count is None or self.student_names is None:
                raise ValueError("student count and names are required at checkout")
            students = AttendanceStudentsPayload(student_count=self.student_count, student_names=self.student_names)
            self.student_names = students.student_names
        return self


class AttendanceCheckOutPayload(AttendanceCheckInPayload, CheckoutStudentsPayload):
    pass


class ManualAttendancePayload(BaseModel):
    teacher_id: str
    center_id: str
    checked_at: datetime
    event_type: Literal["CHECK_IN", "CHECK_OUT"] = "CHECK_IN"
    student_count: Optional[int] = Field(default=None, strict=True, gt=0)
    student_names: Optional[list[str]] = None
    session_students: Optional[list[SessionStudentsPayload]] = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def validate_students(self) -> "ManualAttendancePayload":
        if self.event_type == "CHECK_OUT":
            students = CheckoutStudentsPayload(
                student_count=self.student_count, student_names=self.student_names,
                session_students=self.session_students,
            )
            self.student_names = students.student_names
        elif self.student_count is not None or self.student_names is not None or self.session_students is not None:
            raise ValueError("student information is recorded at checkout only")
        return self

    @field_validator("teacher_id", "center_id")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("value is required")
        return value


class TeacherScoreEventCreate(BaseModel):
    score_month: date
    delta: int
    reason: str
    evidence_text: Optional[str] = None
    evidence_url: Optional[str] = None

    @field_validator("delta")
    @classmethod
    def validate_delta(cls, value: int) -> int:
        if value == 0:
            raise ValueError("delta must not be zero")
        return value

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("reason is required")
        return value

    @field_validator("evidence_text")
    @classmethod
    def validate_evidence_text(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() or None if value is not None else None

    @field_validator("evidence_url")
    @classmethod
    def validate_evidence_url(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        value = value.strip()
        return value or None

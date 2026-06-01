from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.orm import Session

from services.teacher_event_broker import teacher_event_broker


def ensure_teacher_events_table(db: Session) -> None:
    db.execute(
        text("""
            CREATE TABLE IF NOT EXISTS teacher_events (
                event_id UUID PRIMARY KEY,
                teacher_id VARCHAR(20) NOT NULL REFERENCES teachers(teacher_id) ON DELETE CASCADE,
                event_type VARCHAR(20) NOT NULL,
                score_month DATE NULL,
                delta INT NULL CHECK (delta IS NULL OR delta <> 0),
                reason TEXT NOT NULL,
                evidence_text TEXT,
                evidence_url TEXT,
                profile_field VARCHAR(50),
                old_value TEXT,
                new_value TEXT,
                created_by VARCHAR(7) NOT NULL REFERENCES users(user_code) ON DELETE RESTRICT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                teacher_read_at TIMESTAMPTZ NULL,
                CHECK (event_type IN ('SCORE', 'PROFILE')),
                CHECK (score_month IS NULL OR score_month = date_trunc('month', score_month)::date)
            )
        """)
    )
    db.execute(
        text("""
            CREATE INDEX IF NOT EXISTS idx_teacher_events_score_teacher_month
                ON teacher_events(teacher_id, score_month, created_at DESC)
                WHERE event_type = 'SCORE'
        """)
    )
    db.execute(
        text("""
            CREATE INDEX IF NOT EXISTS idx_teacher_events_unread
                ON teacher_events(teacher_id, teacher_read_at, created_at DESC)
                WHERE teacher_read_at IS NULL
        """)
    )
    has_old_score_table = db.execute(text("SELECT to_regclass('teacher_score_events')")).scalar()
    if has_old_score_table:
        db.execute(
            text("""
                INSERT INTO teacher_events (
                    event_id, teacher_id, event_type, score_month, delta, reason,
                    evidence_text, evidence_url, created_by, created_at, teacher_read_at
                )
                SELECT event_id, teacher_id, 'SCORE', score_month, delta, reason,
                       evidence_text, evidence_url, created_by, created_at, teacher_read_at
                FROM teacher_score_events
                ON CONFLICT (event_id) DO NOTHING
            """)
        )
        db.execute(text("DROP TABLE teacher_score_events"))
    db.commit()


def create_teacher_profile_event(
    db: Session,
    *,
    teacher_id: str,
    field: str,
    old_value,
    new_value,
    created_by: str,
) -> None:
    ensure_teacher_events_table(db)
    label_by_field = {
        "elo": "ELO",
        "education_score": "Education",
        "max_slots_per_day": "Max Slots",
    }
    label = label_by_field.get(field, field)

    event = db.execute(
        text("""
            INSERT INTO teacher_events (
                event_id, teacher_id, event_type, reason, evidence_text,
                profile_field, old_value, new_value, created_by
            )
            VALUES (
                :event_id, :teacher_id, 'PROFILE', :reason, :evidence_text,
                :profile_field, :old_value, :new_value, :created_by
            )
            RETURNING event_id, teacher_id, event_type, score_month, delta, reason,
                      evidence_text, evidence_url, profile_field, old_value, new_value,
                      created_by, created_at, teacher_read_at
        """),
        {
            "event_id": str(uuid4()),
            "teacher_id": teacher_id,
            "reason": f"{label} updated",
            "evidence_text": f"{label}: {old_value if old_value is not None else '-'} -> {new_value if new_value is not None else '-'}",
            "profile_field": field,
            "old_value": None if old_value is None else str(old_value),
            "new_value": None if new_value is None else str(new_value),
            "created_by": created_by,
        },
    ).mappings().first()
    event_dict = dict(event)
    teacher_event_broker.publish(teacher_id, event_dict)
    return event_dict

from sqlalchemy import text
from sqlalchemy.orm import Session


def ensure_class_teachers_table(db: Session) -> None:
    db.execute(
        text("""
            CREATE TABLE IF NOT EXISTS class_teachers (
                class_id VARCHAR(20) NOT NULL REFERENCES classes(class_id) ON DELETE CASCADE,
                teacher_id VARCHAR(20) NOT NULL REFERENCES teachers(teacher_id),
                assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (class_id, teacher_id)
            )
        """)
    )
    db.execute(
        text("""
            INSERT INTO class_teachers (class_id, teacher_id)
            SELECT class_id, teacher_id
            FROM classes
            WHERE teacher_id IS NOT NULL
            ON CONFLICT (class_id, teacher_id) DO NOTHING
        """)
    )
    db.execute(
        text("""
            CREATE INDEX IF NOT EXISTS idx_class_teachers_teacher_class
            ON class_teachers(teacher_id, class_id)
        """)
    )


def ensure_class_teacher_reassignment_overrides_table(db: Session) -> None:
    db.execute(
        text("""
            CREATE TABLE IF NOT EXISTS class_teacher_reassignment_overrides (
                override_id BIGSERIAL PRIMARY KEY,
                class_id VARCHAR(20) NOT NULL REFERENCES classes(class_id) ON DELETE CASCADE,
                original_teacher_id VARCHAR(20) NOT NULL REFERENCES teachers(teacher_id),
                replacement_teacher_id VARCHAR(20) NOT NULL REFERENCES teachers(teacher_id),
                reassignment_mode VARCHAR(20) NOT NULL DEFAULT 'TEMPORARY'
                    CHECK (reassignment_mode IN ('TEMPORARY', 'PERMANENT')),
                effective_date DATE NOT NULL,
                expires_on DATE NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                created_by VARCHAR(7) REFERENCES users(user_code) ON DELETE SET NULL,
                UNIQUE (class_id, original_teacher_id, effective_date)
            )
        """)
    )
    db.execute(
        text("""
            CREATE INDEX IF NOT EXISTS idx_class_teacher_reassignment_overrides_active
            ON class_teacher_reassignment_overrides(class_id, effective_date, expires_on)
        """)
    )


def class_teacher_count(db: Session, class_id: str) -> int:
    ensure_class_teachers_table(db)
    return db.execute(
        text("""
            SELECT COUNT(*)
            FROM class_teachers
            WHERE class_id = :class_id
        """),
        {"class_id": class_id},
    ).scalar_one()

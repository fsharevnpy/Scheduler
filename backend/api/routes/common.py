from schemas.auth import CurrentUser
from sqlalchemy import text
from sqlalchemy.orm import Session


VALID_CLASS_STATUS = {"OPEN", "ASSIGNED", "CANCELLED", "NEED_REPLACEMENT"}
VALID_LEAVE_STATUS = {"REQUESTED", "APPROVED", "REJECTED", "CANCELLED"}


def get_manageable_roles(current_user: CurrentUser) -> set[str]:
    if current_user.role == "developer":
        return {"developer", "manager", "teacher"}
    if current_user.role == "manager":
        return {"manager", "teacher"}
    return set()


def ensure_classes_day_of_week(db: Session) -> None:
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext('classes_day_of_week_migration'))"))

    has_day_column = db.execute(
        text("""
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'classes'
              AND column_name = 'day_of_week'
        """)
    ).first()

    if not has_day_column:
        db.execute(text("ALTER TABLE classes ADD COLUMN day_of_week VARCHAR(10)"))

    has_class_date_column = db.execute(
        text("""
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'classes'
              AND column_name = 'class_date'
        """)
    ).first()

    if has_class_date_column:
        db.execute(
            text("""
                UPDATE classes
                SET day_of_week = CASE EXTRACT(ISODOW FROM class_date)
                    WHEN 1 THEN 'T2'
                    WHEN 2 THEN 'T3'
                    WHEN 3 THEN 'T4'
                    WHEN 4 THEN 'T5'
                    WHEN 5 THEN 'T6'
                    WHEN 6 THEN 'T7'
                    ELSE 'CN'
                END
                WHERE day_of_week IS NULL
            """)
        )
        db.execute(text("ALTER TABLE classes DROP COLUMN class_date"))

    day_column = db.execute(
        text("""
            SELECT is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'classes'
              AND column_name = 'day_of_week'
        """)
    ).mappings().first()

    if day_column and day_column["is_nullable"] == "YES":
        null_count = db.execute(text("SELECT COUNT(*) FROM classes WHERE day_of_week IS NULL")).scalar_one()
        if null_count > 0:
            db.commit()
            return

        db.execute(text("ALTER TABLE classes ALTER COLUMN day_of_week SET NOT NULL"))

    db.execute(
        text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint
                    WHERE conname = 'classes_day_of_week_check'
                ) THEN
                    ALTER TABLE classes
                    ADD CONSTRAINT classes_day_of_week_check
                    CHECK (day_of_week IN ('T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'));
                END IF;
            END $$;
        """)
    )
    db.execute(text("CREATE INDEX IF NOT EXISTS idx_classes_day ON classes(day_of_week)"))
    db.execute(text("CREATE INDEX IF NOT EXISTS idx_classes_teacher_day ON classes(teacher_id, day_of_week)"))
    db.execute(text("CREATE INDEX IF NOT EXISTS idx_classes_center_day ON classes(center_id, day_of_week)"))
    db.commit()

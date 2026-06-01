CREATE INDEX IF NOT EXISTS idx_center_slots_center_day
    ON center_slots(center_id, day_of_week);

CREATE INDEX IF NOT EXISTS idx_teacher_preferences_teacher
    ON teacher_preferences(teacher_id);

CREATE INDEX IF NOT EXISTS idx_teacher_preferences_center_day
    ON teacher_preferences(preferred_center_id, day_of_week);

CREATE INDEX IF NOT EXISTS idx_classes_date
    ON classes(class_date);

CREATE INDEX IF NOT EXISTS idx_classes_teacher_date
    ON classes(teacher_id, class_date);

CREATE INDEX IF NOT EXISTS idx_classes_center_date
    ON classes(center_id, class_date);

CREATE INDEX IF NOT EXISTS idx_leave_requests_class
    ON leave_requests(class_id);

CREATE INDEX IF NOT EXISTS idx_leave_requests_teacher
    ON leave_requests(teacher_id);

CREATE INDEX IF NOT EXISTS idx_attendance_records_user_time
    ON attendance_records(user_code, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_records_teacher_time
    ON attendance_records(teacher_id, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_requests_user_code
    ON password_reset_requests(user_code);

CREATE INDEX IF NOT EXISTS idx_password_reset_requests_status_created
    ON password_reset_requests(status, created_at);

CREATE INDEX IF NOT EXISTS idx_users_user_code
    ON users(user_code);

CREATE INDEX IF NOT EXISTS idx_teacher_events_score_teacher_month
    ON teacher_events(teacher_id, score_month, created_at DESC)
    WHERE event_type = 'SCORE';

CREATE INDEX IF NOT EXISTS idx_teacher_events_unread
    ON teacher_events(teacher_id, teacher_read_at, created_at DESC)
    WHERE teacher_read_at IS NULL;

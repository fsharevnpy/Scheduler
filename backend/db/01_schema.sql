-- =========================
-- 1. Centers
-- =========================
CREATE TABLE centers (
    center_id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    room_count INT NOT NULL CHECK (room_count > 0),
    latitude NUMERIC(9,6) NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
    longitude NUMERIC(9,6) NOT NULL CHECK (longitude >= -180 AND longitude <= 180)
);

-- =========================
-- 2. Center Slots
-- =========================
CREATE TABLE center_slots (
    center_slot_id BIGSERIAL PRIMARY KEY,
    center_id VARCHAR(20) NOT NULL REFERENCES centers(center_id) ON DELETE CASCADE,
    day_of_week VARCHAR(10) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    max_room INT NOT NULL CHECK (max_room > 0),
    CHECK (start_time < end_time),
    CHECK (day_of_week IN ('T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN')),
    UNIQUE (center_id, day_of_week, start_time, end_time)
);

-- =========================
-- 3. Teachers
-- =========================
CREATE TABLE teachers (
    teacher_id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    contact VARCHAR(50),
    email VARCHAR(100),
    elo INT NOT NULL DEFAULT 0,
    education_score NUMERIC(3,1) CHECK (education_score IS NULL OR (education_score >= 0 AND education_score <= 10)),
    max_slots_per_day INT NOT NULL DEFAULT 2 CHECK (max_slots_per_day > 0),
    active BOOLEAN NOT NULL DEFAULT TRUE
);

-- =========================
-- 4. Users
-- =========================
CREATE TABLE users (
    user_id UUID PRIMARY KEY,
    user_code VARCHAR(7) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    profile_image_url VARCHAR(255),
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('developer', 'manager', 'teacher')),
    teacher_id VARCHAR(20) REFERENCES teachers(teacher_id) ON DELETE SET NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    CHECK (user_code ~ '^[0-9]{7}$')
);

-- =========================
-- 5. Teacher Preferences
-- =========================
CREATE TABLE teacher_preferences (
    preference_id BIGSERIAL PRIMARY KEY,
    teacher_id VARCHAR(20) NOT NULL REFERENCES teachers(teacher_id) ON DELETE CASCADE,
    preferred_center_id VARCHAR(20) NOT NULL REFERENCES centers(center_id) ON DELETE CASCADE,
    day_of_week VARCHAR(10) NOT NULL,
    preferred_start_time TIME NOT NULL,
    preferred_end_time TIME NOT NULL,
    CHECK (preferred_start_time < preferred_end_time),
    CHECK (day_of_week IN ('T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'))
);

-- =========================
-- 6. Classes
-- =========================
CREATE TABLE classes (
    class_id VARCHAR(20) PRIMARY KEY,
    day_of_week VARCHAR(10) NOT NULL,
    center_id VARCHAR(20) NOT NULL REFERENCES centers(center_id),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    teacher_id VARCHAR(20) REFERENCES teachers(teacher_id),
    status VARCHAR(30) NOT NULL,
    CHECK (start_time < end_time),
    CHECK (day_of_week IN ('T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN')),
    CHECK (status IN ('OPEN', 'ASSIGNED', 'CANCELLED', 'NEED_REPLACEMENT'))
);

CREATE TABLE class_teachers (
    class_id VARCHAR(20) NOT NULL REFERENCES classes(class_id) ON DELETE CASCADE,
    teacher_id VARCHAR(20) NOT NULL REFERENCES teachers(teacher_id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (class_id, teacher_id)
);

CREATE TABLE class_teacher_reassignment_overrides (
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
);

CREATE INDEX idx_class_teacher_reassignment_overrides_active
    ON class_teacher_reassignment_overrides(class_id, effective_date, expires_on);

-- =========================
-- 7. Leave Requests
-- =========================
CREATE TABLE leave_requests (
    request_id VARCHAR(20) PRIMARY KEY,
    class_id VARCHAR(20) NOT NULL REFERENCES classes(class_id) ON DELETE CASCADE,
    teacher_id VARCHAR(20) NOT NULL REFERENCES teachers(teacher_id),
    assigned_manager_code VARCHAR(7) REFERENCES users(user_code) ON DELETE SET NULL,
    request_date DATE NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    manager_read_at TIMESTAMPTZ NULL,
    CHECK (status IN ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED'))
);

CREATE UNIQUE INDEX ux_leave_requests_active_teacher_class
    ON leave_requests (teacher_id, class_id)
    WHERE status IN ('REQUESTED', 'APPROVED');

-- =========================
-- 8. Password Reset Requests
-- =========================
CREATE TABLE password_reset_requests (
    request_id UUID PRIMARY KEY,
    user_code VARCHAR(7) NOT NULL REFERENCES users(user_code) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL,
    request_note TEXT,
    resolution_note TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    resolved_by VARCHAR(7) REFERENCES users(user_code) ON DELETE SET NULL,
    resolved_at TIMESTAMP NULL,
    CHECK (status IN ('REQUESTED', 'RESOLVED'))
);

-- =========================
-- 9. Attendance Records
-- =========================
CREATE TABLE attendance_records (
    record_id UUID PRIMARY KEY,
    user_code VARCHAR(7) NOT NULL REFERENCES users(user_code) ON DELETE CASCADE,
    teacher_id VARCHAR(20) REFERENCES teachers(teacher_id) ON DELETE SET NULL,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    latitude NUMERIC(9,6) NOT NULL,
    longitude NUMERIC(9,6) NOT NULL,
    accuracy_meters NUMERIC(10,2),
    status VARCHAR(10) NOT NULL DEFAULT 'INVALID',
    nearest_center_name VARCHAR(100),
    student_names JSONB
);

CREATE INDEX idx_attendance_records_user_time
    ON attendance_records(user_code, checked_at DESC);

-- =========================
-- 10. Push Subscriptions
-- =========================
CREATE TABLE push_subscriptions (
    subscription_id BIGSERIAL PRIMARY KEY,
    user_code VARCHAR(7) NOT NULL REFERENCES users(user_code) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    endpoint_hash VARCHAR(64) NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_push_subscriptions_user_code
    ON push_subscriptions(user_code);

-- =========================
-- 11. Teacher Events
-- =========================
CREATE TABLE teacher_events (
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
);

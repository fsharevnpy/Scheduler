INSERT INTO centers (center_id, name, room_count)
VALUES
    ('CS1', 'Quan 9', 2);

INSERT INTO center_slots (center_id, day_of_week, start_time, end_time, max_room)
VALUES
    ('CS1', 'T2', '17:00', '18:30', 2),
    ('CS1', 'T2', '18:30', '20:00', 2),
    ('CS1', 'T4', '17:00', '18:30', 2);

INSERT INTO teachers (teacher_id, name, contact, score, max_slots_per_day, active)
VALUES
    ('GV0', 'Nguyen', '07xxxxxxx', 1350, 2, TRUE),
    ('GV1', 'Tran',   '08xxxxxxx', 1280, 2, TRUE),
    ('GV2', 'Le',     '09xxxxxxx', 1200, 1, TRUE);

INSERT INTO teacher_preferences (
    teacher_id,
    preferred_center_id,
    day_of_week,
    preferred_start_time,
    preferred_end_time
)
VALUES
    ('GV0', 'CS1', 'T2', '18:00', '19:00'),
    ('GV1', 'CS1', 'T2', '17:00', '20:00'),
    ('GV2', 'CS1', 'T4', '17:00', '18:30');

INSERT INTO classes (
    class_id,
    class_date,
    center_id,
    start_time,
    end_time,
    room_no,
    teacher_id,
    status
)
VALUES
    ('CL001', '2026-03-23', 'CS1', '17:00', '18:30', 1, 'GV0', 'ASSIGNED'),
    ('CL002', '2026-03-23', 'CS1', '18:30', '20:00', 2, 'GV1', 'ASSIGNED');

INSERT INTO leave_requests (
    request_id,
    class_id,
    teacher_id,
    request_date,
    status
)
VALUES
    ('LR001', 'CL001', 'GV0', '2026-03-23', 'REQUESTED');
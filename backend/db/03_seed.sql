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

INSERT INTO users (user_id, username, password_hash, role, teacher_id, active)
VALUES
    ('5a9dc527-a1fd-4a7f-b130-945ddcecc8ef', 'developer', 'scrypt$16384$8$1$Owaj8_VuEstlCHEZdBHPQw$VsNa-9Yw7ic5u0_4D9z3khJNJoxaM2Jlq0yUoMgC9RE', 'developer', NULL, TRUE),
    ('2f3e6333-e160-4d3b-96c6-24e4d33f76db', 'manager', 'scrypt$16384$8$1$FBvsRVaWrLAwhQX5yLovyg$BfKokEw2tas0r7vv01LZEGq4Ay3ZBnO2J-q839hsNxM', 'manager', NULL, TRUE),
    ('9fd30d6b-ad68-4322-afb3-b19b88d52b45', 'gv0', 'scrypt$16384$8$1$1nqFsW8PL_xjPQ_OLl5yKg$PeWBqgSAy6XaozV62kjQZmrtrNGz88cnD2z1zKBahU4', 'teacher', 'GV0', TRUE),
    ('f4dc53a4-b8e6-4d2e-81b6-0e2de3e514df', 'gv1', 'scrypt$16384$8$1$j4plORlhpYnjPRqw6m7DrA$pgPixJJ5cGUyEihG1X0zVwhfB5IM7o8EYItN_Aug3ms', 'teacher', 'GV1', TRUE),
    ('33e62206-bf08-44ff-a4ee-e6b70dc4a709', 'gv2', 'scrypt$16384$8$1$Hijf9CL_6B5A2JiSpC0Ffg$_TIrKtqy_blFHduVFe6LueO66STHV5c8Bt4Zl78l6n4', 'teacher', 'GV2', TRUE);

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

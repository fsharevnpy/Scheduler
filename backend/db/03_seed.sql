INSERT INTO centers (center_id, name, room_count)
VALUES
    ('CS1', 'Quan 9', 2),
    ('CS2', 'Thu Duc', 3),
    ('CS3', 'Binh Thanh', 2);

INSERT INTO center_slots (center_id, day_of_week, start_time, end_time, max_room)
VALUES
    ('CS1', 'T2', '17:00', '18:30', 2),
    ('CS1', 'T2', '18:30', '20:00', 2),
    ('CS1', 'T4', '17:00', '18:30', 2),
    ('CS2', 'T3', '17:00', '18:30', 3),
    ('CS2', 'T3', '18:30', '20:00', 3),
    ('CS2', 'T5', '17:00', '18:30', 3),
    ('CS3', 'T4', '17:00', '18:30', 2),
    ('CS3', 'T6', '18:30', '20:00', 2);

INSERT INTO teachers (teacher_id, name, contact, score, max_slots_per_day, active)
VALUES
    ('GV0', 'Nguyen Minh Anh',  '070000001', 1350, 2, TRUE),
    ('GV1', 'Tran Hoang Bao',   '070000002', 1280, 2, TRUE),
    ('GV2', 'Le Gia Huy',       '070000003', 1200, 1, TRUE),
    ('GV3', 'Pham Khanh Linh',  '070000004', 1420, 2, TRUE),
    ('GV4', 'Vo Quoc Dat',      '070000005', 1310, 2, TRUE),
    ('GV5', 'Bui Thanh Nha',    '070000006', 1255, 3, TRUE),
    ('GV6', 'Doan Minh Chau',   '070000007', 1385, 2, TRUE),
    ('GV7', 'Hoang Gia Han',    '070000008', 1275, 2, TRUE);

INSERT INTO users (user_id, user_code, display_name, password_hash, role, teacher_id, active)
VALUES
    ('5a9dc527-a1fd-4a7f-b130-945ddcecc8ef', '2603000', 'System Developer', 'scrypt$16384$8$1$Owaj8_VuEstlCHEZdBHPQw$VsNa-9Yw7ic5u0_4D9z3khJNJoxaM2Jlq0yUoMgC9RE', 'developer', NULL, TRUE),
    ('2f3e6333-e160-4d3b-96c6-24e4d33f76db', '2603001', 'Operations Manager', 'scrypt$16384$8$1$FBvsRVaWrLAwhQX5yLovyg$BfKokEw2tas0r7vv01LZEGq4Ay3ZBnO2J-q839hsNxM', 'manager', NULL, TRUE),
    ('9fd30d6b-ad68-4322-afb3-b19b88d52b45', '2603002', 'Nguyen Minh Anh', 'scrypt$16384$8$1$1nqFsW8PL_xjPQ_OLl5yKg$PeWBqgSAy6XaozV62kjQZmrtrNGz88cnD2z1zKBahU4', 'teacher', 'GV0', TRUE),
    ('f4dc53a4-b8e6-4d2e-81b6-0e2de3e514df', '2603003', 'Tran Hoang Bao', 'scrypt$16384$8$1$j4plORlhpYnjPRqw6m7DrA$pgPixJJ5cGUyEihG1X0zVwhfB5IM7o8EYItN_Aug3ms', 'teacher', 'GV1', TRUE),
    ('33e62206-bf08-44ff-a4ee-e6b70dc4a709', '2603004', 'Le Gia Huy', 'scrypt$16384$8$1$Hijf9CL_6B5A2JiSpC0Ffg$_TIrKtqy_blFHduVFe6LueO66STHV5c8Bt4Zl78l6n4', 'teacher', 'GV2', TRUE),
    ('54a6f694-3f45-4c1c-968c-7610b7f31fd1', '2603005', 'Pham Khanh Linh', 'scrypt$16384$8$1$Hijf9CL_6B5A2JiSpC0Ffg$_TIrKtqy_blFHduVFe6LueO66STHV5c8Bt4Zl78l6n4', 'teacher', 'GV3', TRUE),
    ('6202819d-e3c0-44d1-9a3f-1b4529db1a9e', '2603006', 'Vo Quoc Dat', 'scrypt$16384$8$1$Hijf9CL_6B5A2JiSpC0Ffg$_TIrKtqy_blFHduVFe6LueO66STHV5c8Bt4Zl78l6n4', 'teacher', 'GV4', TRUE),
    ('e92ba56f-c795-4ae8-9b7f-8cc8777fe38a', '2603007', 'Bui Thanh Nha', 'scrypt$16384$8$1$Hijf9CL_6B5A2JiSpC0Ffg$_TIrKtqy_blFHduVFe6LueO66STHV5c8Bt4Zl78l6n4', 'teacher', 'GV5', TRUE),
    ('f76189a3-2a5d-4f76-97a4-3e1d4f493418', '2603008', 'Doan Minh Chau', 'scrypt$16384$8$1$Hijf9CL_6B5A2JiSpC0Ffg$_TIrKtqy_blFHduVFe6LueO66STHV5c8Bt4Zl78l6n4', 'teacher', 'GV6', TRUE),
    ('1b0f4b9d-4d68-48fb-8cda-5d7588475fb2', '2603009', 'Hoang Gia Han', 'scrypt$16384$8$1$Hijf9CL_6B5A2JiSpC0Ffg$_TIrKtqy_blFHduVFe6LueO66STHV5c8Bt4Zl78l6n4', 'teacher', 'GV7', TRUE);

INSERT INTO teacher_preferences (
    teacher_id,
    preferred_center_id,
    day_of_week,
    preferred_start_time,
    preferred_end_time
)
VALUES
    ('GV0', 'CS1', 'T2', '17:00', '18:30'),
    ('GV1', 'CS1', 'T2', '17:00', '20:00'),
    ('GV2', 'CS1', 'T4', '17:00', '18:30'),
    ('GV3', 'CS2', 'T3', '17:00', '20:00'),
    ('GV4', 'CS2', 'T5', '17:00', '18:30'),
    ('GV5', 'CS3', 'T4', '17:00', '18:30'),
    ('GV5', 'CS3', 'T6', '18:30', '20:00'),
    ('GV6', 'CS1', 'T2', '18:30', '20:00'),
    ('GV6', 'CS2', 'T3', '18:30', '20:00'),
    ('GV7', 'CS3', 'T6', '18:30', '20:00');

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
    ('CL001', '2026-03-23', 'CS1', '17:00', '18:30', 1, 'GV0', 'NEED_REPLACEMENT'),
    ('CL002', '2026-03-23', 'CS1', '18:30', '20:00', 2, 'GV1', 'ASSIGNED'),
    ('CL003', '2026-03-24', 'CS2', '17:00', '18:30', 1, 'GV3', 'NEED_REPLACEMENT'),
    ('CL004', '2026-03-24', 'CS2', '18:30', '20:00', 2, 'GV6', 'ASSIGNED'),
    ('CL005', '2026-03-25', 'CS3', '17:00', '18:30', 1, 'GV5', 'ASSIGNED'),
    ('CL006', '2026-03-27', 'CS3', '18:30', '20:00', 2, 'GV7', 'OPEN');

INSERT INTO leave_requests (
    request_id,
    class_id,
    teacher_id,
    request_date,
    reason,
    status
)
VALUES
    ('LR001', 'CL001', 'GV0', '2026-03-23', 'Medical leave', 'REQUESTED'),
    ('LR002', 'CL003', 'GV3', '2026-03-24', 'Family commitment', 'APPROVED');

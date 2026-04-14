INSERT INTO centers (center_id, name, room_count)
VALUES
    ('CS1', 'Vạn Phúc', 2),
    ('CS2', 'Cityland', 3),
    ('CS3', 'Vin', 2);

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

INSERT INTO teachers (teacher_id, name, contact, email, elo, education_score, max_slots_per_day, active)
VALUES
    ('GV0', 'Nguyễn Công Thành',     '0355718871', 'gv0@gmail.com', 1350, 7.8, 2, TRUE),
    ('GV1', 'Nguyễn Đình Ngọc Ân',   '0912627404', 'gv1@gmail.com', 1800, 8.5, 2, TRUE),
    ('GV2', 'Vũ Hoàng Nhật Trường',  '0966163026', 'gv2@gmail.com', 2200, 9.1, 1, TRUE),
    ('GV3', 'Nguyễn Vũ Minh Trí',    '0816706228', 'gv3@gmail.com', 1890, 8.3, 2, TRUE),
    ('GV4', 'Trịnh Quán Lâm',        '0853271771', 'gv4@gmail.com', 1400, 7.2, 2, TRUE),
    ('GV5', 'Nguyễn Tiến Hiếu',      '0962450531', 'gv5@gmail.com', 1821, 8.7, 3, TRUE),
    ('GV6', 'Nguyễn Thị Thuý Quyên', '0794337990', 'gv6@gmail.com', 1772, 8.1, 2, TRUE),
    ('GV7', 'Đỗ Đinh Hồng Chinh',    '0949217359', 'gv7@gmail.com', 1810, 8.9, 2, TRUE),
    ('GV8', 'Nguyễn Trí Thịnh',      '0913699745', 'gv8@gmail.com', 1738, 7.6, 2, TRUE);

INSERT INTO users (user_id, user_code, display_name, profile_image_url, password_hash, role, teacher_id, active)
VALUES
    ('5a9dc527-a1fd-4a7f-b130-945ddcecc8ef', '0000000', 'System Developer', NULL, 'scrypt$16384$8$1$c8goqjJklAlaQT0soEfu0Q$cJnFYkNdHUibVCTpgZ6u3RK0WDRY4AM17gQWHUG4Ue4', 'developer', NULL, TRUE),
    ('2f3e6333-e160-4d3b-96c6-24e4d33f76db', '2603001', 'Nguyễn Công Thành', 'profile-imgs/2603001.jpg', 'scrypt$16384$8$1$FBvsRVaWrLAwhQX5yLovyg$BfKokEw2tas0r7vv01LZEGq4Ay3ZBnO2J-q839hsNxM', 'manager', NULL, TRUE),
    ('9fd30d6b-ad68-4322-afb3-b19b88d52b45', '2603002', 'Nguyễn Công Thành', 'profile-imgs/2603002.jpg', 'scrypt$16384$8$1$1nqFsW8PL_xjPQ_OLl5yKg$PeWBqgSAy6XaozV62kjQZmrtrNGz88cnD2z1zKBahU4', 'teacher', 'GV0', TRUE),
    ('f4dc53a4-b8e6-4d2e-81b6-0e2de3e514df', '2603003', 'Nguyễn Đình Ngọc Ân', NULL, 'scrypt$16384$8$1$j4plORlhpYnjPRqw6m7DrA$pgPixJJ5cGUyEihG1X0zVwhfB5IM7o8EYItN_Aug3ms', 'teacher', 'GV1', TRUE),
    ('33e62206-bf08-44ff-a4ee-e6b70dc4a709', '2603004', 'Vũ Hoàng Nhật Trường', NULL, 'scrypt$16384$8$1$Hijf9CL_6B5A2JiSpC0Ffg$_TIrKtqy_blFHduVFe6LueO66STHV5c8Bt4Zl78l6n4', 'teacher', 'GV2', TRUE),
    ('54a6f694-3f45-4c1c-968c-7610b7f31fd1', '2603005', 'Nguyễn Vũ Minh Trí', NULL, 'scrypt$16384$8$1$Hijf9CL_6B5A2JiSpC0Ffg$_TIrKtqy_blFHduVFe6LueO66STHV5c8Bt4Zl78l6n4', 'teacher', 'GV3', TRUE),
    ('6202819d-e3c0-44d1-9a3f-1b4529db1a9e', '2603006', 'Trịnh Quán Lâm', NULL, 'scrypt$16384$8$1$Hijf9CL_6B5A2JiSpC0Ffg$_TIrKtqy_blFHduVFe6LueO66STHV5c8Bt4Zl78l6n4', 'teacher', 'GV4', TRUE),
    ('e92ba56f-c795-4ae8-9b7f-8cc8777fe38a', '2603007', 'Nguyễn Tiến Hiếu', NULL, 'scrypt$16384$8$1$Hijf9CL_6B5A2JiSpC0Ffg$_TIrKtqy_blFHduVFe6LueO66STHV5c8Bt4Zl78l6n4', 'teacher', 'GV5', TRUE),
    ('f76189a3-2a5d-4f76-97a4-3e1d4f493418', '2603008', 'Nguyễn Thị Thuý Quyên', NULL, 'scrypt$16384$8$1$Hijf9CL_6B5A2JiSpC0Ffg$_TIrKtqy_blFHduVFe6LueO66STHV5c8Bt4Zl78l6n4', 'teacher', 'GV6', TRUE),
    ('1b0f4b9d-4d68-48fb-8cda-5d7588475fb2', '2603009', 'Đỗ Đinh Hồng Chinh', NULL, 'scrypt$16384$8$1$Hijf9CL_6B5A2JiSpC0Ffg$_TIrKtqy_blFHduVFe6LueO66STHV5c8Bt4Zl78l6n4', 'teacher', 'GV7', TRUE),
    ('2c1f5c0e-5e79-49ac-9d0b-6e8699586ac3', '2603010', 'Nguyễn Trí Thịnh', NULL, 'scrypt$16384$8$1$Hijf9CL_6B5A2JiSpC0Ffg$_TIrKtqy_blFHduVFe6LueO66STHV5c8Bt4Zl78l6n4', 'teacher', 'GV8', TRUE);

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
    ('CL006', '2026-03-27', 'CS3', '18:30', '20:00', 2, NULL, 'OPEN');

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

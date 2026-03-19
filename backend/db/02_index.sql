CREATE INDEX idx_center_slots_center_day
    ON center_slots(center_id, day_of_week);

CREATE INDEX idx_teacher_preferences_teacher
    ON teacher_preferences(teacher_id);

CREATE INDEX idx_teacher_preferences_center_day
    ON teacher_preferences(preferred_center_id, day_of_week);

CREATE INDEX idx_classes_date
    ON classes(class_date);

CREATE INDEX idx_classes_teacher_date
    ON classes(teacher_id, class_date);

CREATE INDEX idx_classes_center_date
    ON classes(center_id, class_date);

CREATE INDEX idx_leave_requests_class
    ON leave_requests(class_id);

CREATE INDEX idx_leave_requests_teacher
    ON leave_requests(teacher_id);
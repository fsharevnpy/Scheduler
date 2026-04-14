# Database Model Overview

## Purpose

The database supports:
- authentication and role-based access
- teacher and class scheduling
- leave request workflow
- replacement teacher selection

## Main Tables

### `centers`

Stores training centers.

Key fields:
- `center_id`
- `name`
- `room_count`

### `center_slots`

Stores available slots per center and day of week.

Key fields:
- `center_id`
- `day_of_week`
- `start_time`
- `end_time`
- `max_room`

### `teachers`

Stores teacher profile and scheduling capacity.

Key fields:
- `teacher_id`
- `name`
- `contact`
- `email`
- `elo`
- `education_score`
- `max_slots_per_day`
- `active`

### `users`

Stores login accounts and role mapping.

Key fields:
- `user_id`
- `user_code`
- `password_hash`
- `role`
- `teacher_id`
- `active`

Notes:
- `teacher_id` is optional
- `user_code` is the generated account code and login identifier in `YYMMNNN` format
- `teacher` users are linked to a teacher record through `teacher_id`

### `teacher_preferences`

Stores preference-based signals for replacement suggestions.

Key fields:
- `teacher_id`
- `preferred_center_id`
- `day_of_week`
- `preferred_start_time`
- `preferred_end_time`

### `classes`

Stores scheduled classes.

Key fields:
- `class_id`
- `class_date`
- `center_id`
- `start_time`
- `end_time`
- `room_no`
- `teacher_id`
- `status`

Current statuses:
- `OPEN`
- `ASSIGNED`
- `CANCELLED`
- `NEED_REPLACEMENT`

### `leave_requests`

Stores leave requests linked to classes and teachers.

Key fields:
- `request_id`
- `class_id`
- `teacher_id`
- `request_date`
- `status`

Current statuses:
- `REQUESTED`
- `APPROVED`
- `REJECTED`
- `CANCELLED`

### `password_reset_requests`

Stores internal forgot-password requests for admin handling.

Key fields:
- `request_id`
- `user_code`
- `status`
- `request_note`
- `resolution_note`
- `created_at`
- `resolved_by`
- `resolved_at`

Current statuses:
- `REQUESTED`
- `RESOLVED`

## Relationship Summary

- one center has many center slots
- one teacher can have many preferences
- one teacher can teach many classes
- one teacher can have many leave requests
- one class can have many leave requests over time
- one teacher can be linked to one user account in practice
- one user can have many password reset requests over time

## Source of Truth

Schema and seed files:
- [`backend/db/01_schema.sql`](../../backend/db/01_schema.sql)
- [`backend/db/02_index.sql`](../../backend/db/02_index.sql)
- [`backend/db/03_seed.sql`](../../backend/db/03_seed.sql)

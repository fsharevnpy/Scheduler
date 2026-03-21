# Business Rules

## Authentication and Authorization

- Users authenticate with `username` and `password` through `POST /auth/login`.
- On successful login, the backend returns an `access_token`.
- Protected APIs require `Authorization: Bearer <token>`.
- The backend decodes the token, reloads the user from the database, and checks that the user is still active.
- Authorization is role-based with three roles: `developer`, `manager`, `teacher`.

## User Rules

- `developer` can create and delete users with roles `developer`, `manager`, and `teacher`.
- `manager` can create and delete users with roles `manager` and `teacher`.
- `developer` can reset passwords for `developer`, `manager`, and `teacher`.
- `manager` can reset passwords for `manager` and `teacher`.
- `manager` cannot create or delete `developer` users.
- `manager` cannot reset the password of a `developer`.
- A `teacher` user must be linked to a valid `teacher_id`.
- A non-`teacher` user must not have a `teacher_id`.
- One `teacher_id` can only be linked to one user account.
- A user cannot delete their own account.
- Password reset is internal and admin-driven. There is no self-service forgot-password flow.
- User creation and internal password reset share the same password policy:
  - minimum 8 characters
  - at least one uppercase letter
  - at least one lowercase letter
  - at least one number
  - at least one special character

## Teacher Rules

- Only `developer` and `manager` can list, create, and update teachers.
- `teacher_id` must be unique.

## Class Rules

- Only `developer` and `manager` can create and update classes.
- Class status must be one of:
  - `OPEN`
  - `ASSIGNED`
  - `CANCELLED`
  - `NEED_REPLACEMENT`
- `center_id` must exist before a class can be created or updated.
- If `teacher_id` is provided, that teacher must exist.
- `teacher` users can read classes, but only their own classes.

## Leave Request Rules

- Leave request status must be one of:
  - `REQUESTED`
  - `APPROVED`
  - `CANCELLED`
- `teacher` users can only create leave requests for themselves.
- The class in the leave request must exist.
- The `teacher_id` in the leave request must match the current teacher assigned to the class.
- Creating a leave request updates the related class status to `NEED_REPLACEMENT`.
- Only `developer` and `manager` can approve leave requests.
- Approved leave requests also keep the related class in `NEED_REPLACEMENT`.
- `teacher` users can cancel only their own leave requests and only when the request is still `REQUESTED`.
- `manager` and `developer` can cancel any leave request.
- When a leave request is cancelled:
  - if the class has no remaining leave requests in `REQUESTED` or `APPROVED`, class status is reset to:
    - `ASSIGNED` if the class still has a teacher
    - `OPEN` if the class has no teacher

## Replacement Suggestion Rules

- Only `developer` and `manager` can view replacement suggestions.
- The target class must exist.
- Candidate teachers must:
  - be active
  - not be the original teacher of the class
  - not have schedule overlap with another class on the same date
  - not exceed `max_slots_per_day`
- Each candidate gets:
  - `normalized_score` from min-max scaling over the full `teachers.score` range
  - `center_match` = `1` if teacher preference matches the class center, otherwise `0`
  - `time_match` = `1` if teacher preference covers the class day/time, otherwise `0`
- Final ranking score is:
  - `normalized_score * 0.4 + center_match * 0.3 + time_match * 0.3`
- Candidates are sorted by `final_score` descending.

## Replacement Assignment Rules

- Only `developer` and `manager` can assign a replacement teacher.
- The target class must exist.
- The replacement teacher must:
  - exist
  - be active
  - not have schedule conflict
  - not exceed `max_slots_per_day`
- On successful assignment:
  - `classes.teacher_id` is updated
  - `classes.status` becomes `ASSIGNED`

# API Matrix

## Public

| Method | Path | Allowed roles | Purpose |
|---|---|---|---|
| `GET` | `/` | Public | Basic backend status message |
| `GET` | `/health` | Public | Database connectivity check |
| `POST` | `/auth/login` | Public | Authenticate with username/password and return access token |
| `POST` | `/password-reset-requests` | Public | Create an internal password reset request by username |

## Authenticated

| Method | Path | Allowed roles | Purpose |
|---|---|---|---|
| `GET` | `/auth/me` | `developer`, `manager`, `teacher` | Return current authenticated user |
| `GET` | `/password-reset-requests` | `developer`, `manager`, `teacher` | List password reset requests |

## User Management

| Method | Path | Allowed roles | Purpose |
|---|---|---|---|
| `POST` | `/users` | `developer`, `manager` | Create a new user |
| `DELETE` | `/users/{username}` | `developer`, `manager` | Delete a user by username |
| `PUT` | `/users/{username}/reset-password` | `developer`, `manager` | Reset a user password internally |
| `PUT` | `/password-reset-requests/{request_id}/resolve` | `developer`, `manager` | Mark a password reset request as resolved or rejected |

Notes:
- `developer` can create/delete `developer`, `manager`, and `teacher`.
- `manager` can create/delete `manager` and `teacher`, but not `developer`.
- `developer` can reset passwords for `developer`, `manager`, and `teacher`.
- `manager` can reset passwords for `manager` and `teacher`, but not `developer`.
- A user cannot delete their own account.
- `teacher` can view only their own password reset requests.
- `manager` and `developer` can view password reset requests for roles they are allowed to manage.

## Teacher Management

| Method | Path | Allowed roles | Purpose |
|---|---|---|---|
| `GET` | `/teachers` | `developer`, `manager` | List all teachers |
| `POST` | `/teachers` | `developer`, `manager` | Create a teacher |
| `PUT` | `/teachers/{teacher_id}` | `developer`, `manager` | Update a teacher |

## Class Management

| Method | Path | Allowed roles | Purpose |
|---|---|---|---|
| `GET` | `/classes` | `developer`, `manager`, `teacher` | List classes |
| `POST` | `/classes` | `developer`, `manager` | Create a class |
| `PUT` | `/classes/{class_id}` | `developer`, `manager` | Update a class |

Notes:
- `teacher` only sees classes where `classes.teacher_id == current_user.teacher_id`.
- `developer` and `manager` see all classes.

## Leave Requests

| Method | Path | Allowed roles | Purpose |
|---|---|---|---|
| `GET` | `/leave-requests` | `developer`, `manager`, `teacher` | List leave requests |
| `POST` | `/leave-requests` | `developer`, `manager`, `teacher` | Create a leave request |
| `PUT` | `/leave-requests/{request_id}/approve` | `developer`, `manager` | Approve a leave request |
| `PUT` | `/leave-requests/{request_id}/cancel` | `developer`, `manager`, `teacher` | Cancel a leave request |

Notes:
- `teacher` only sees leave requests where `leave_requests.teacher_id == current_user.teacher_id`.
- `teacher` can only create leave requests for their own `teacher_id`.
- `teacher` can only cancel their own leave requests, and only when status is `REQUESTED`.

## Replacement

| Method | Path | Allowed roles | Purpose |
|---|---|---|---|
| `GET` | `/classes/{class_id}/replacement-suggestions` | `developer`, `manager` | Suggest replacement teachers for a class |
| `PUT` | `/classes/{class_id}/assign-replacement` | `developer`, `manager` | Assign a replacement teacher to a class |

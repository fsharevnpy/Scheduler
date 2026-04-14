# API Matrix

## Public

| Method | Path | Allowed roles | Purpose |
|---|---|---|---|
| `GET` | `/` | Public | Basic backend status message |
| `GET` | `/health` | Public | Database connectivity check |
| `POST` | `/auth/login` | Public | Authenticate with user code/password and return access token |
| `POST` | `/password-reset-requests` | Public | Create an internal password reset request by user code |

## Authenticated

| Method | Path | Allowed roles | Purpose |
|---|---|---|---|
| `GET` | `/auth/me` | `developer`, `manager`, `teacher` | Return current authenticated user |
| `PUT` | `/auth/profile/password` | `developer`, `manager`, `teacher` | Change the current user's password with current password verification |
| `PUT` | `/auth/profile/image` | `developer`, `manager`, `teacher` | Upload and replace the current user's profile image |
| `GET` | `/password-reset-requests` | `developer`, `manager`, `teacher` | List password reset requests |
| `GET` | `/centers` | `developer`, `manager`, `teacher` | List centers for teacher preferences and class setup |

## User Management

| Method | Path | Allowed roles | Purpose |
|---|---|---|---|
| `GET` | `/users` | `developer`, `manager` | List manageable users |
| `POST` | `/users` | `developer`, `manager` | Create a staff user or create a teacher account with teacher profile |
| `DELETE` | `/users/{user_code}` | `developer`, `manager` | Delete a user by user code |
| `PUT` | `/password-reset-requests/{request_id}/reset-default` | `developer`, `manager` | Reset a requested account back to the default password |

Notes:
- `developer` can create/delete `developer`, `manager`, and `teacher`.
- `manager` can create/delete `manager` and `teacher`, but not `developer`.
- A user cannot delete their own account.
- `teacher` can view only their own password reset requests.
- `manager` and `developer` can view password reset requests for roles they are allowed to manage.

## Teacher Management

| Method | Path | Allowed roles | Purpose |
|---|---|---|---|
| `GET` | `/teachers` | `developer`, `manager` | List all teachers |
| `GET` | `/teachers/me` | `teacher` | Return the current teacher profile |
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
| `POST` | `/leave-requests` | `developer`, `manager`, `teacher` | Create a leave request with a required reason |
| `PUT` | `/leave-requests/{request_id}/approve` | `developer`, `manager` | Approve a leave request |
| `PUT` | `/leave-requests/{request_id}/reject` | `developer`, `manager` | Reject a leave request |
| `PUT` | `/leave-requests/{request_id}/cancel` | `teacher` | Cancel the current teacher's own requested leave request |

Notes:
- `teacher` only sees leave requests where `leave_requests.teacher_id == current_user.teacher_id`.
- `teacher` can only create leave requests for their own `teacher_id`.
- `teacher` can only cancel their own leave requests, and only when status is `REQUESTED`.
- only `REQUESTED` leave requests can be approved or rejected.

## Replacement

| Method | Path | Allowed roles | Purpose |
|---|---|---|---|
| `GET` | `/classes/{class_id}/replacement-suggestions` | `developer`, `manager` | Suggest replacement teachers for a class |
| `PUT` | `/classes/{class_id}/assign-replacement` | `developer`, `manager` | Assign a replacement teacher to a class |

# Frontend Screen Matrix

## Scope

Initial frontend scope includes three screens:
- `Login`
- `Register`
- `Monitor`

The `Register` screen is an internal user creation screen, not a public self-signup page.

## Route Map

| Route | Requires login | Allowed roles | Purpose |
|---|---|---|---|
| `/login` | No | Public | Authenticate and receive `access_token` |
| `/register` | Yes | `developer`, `manager` | Create new users |
| `/monitor` | Yes | `developer`, `manager`, `teacher` | Main dashboard / working screen |

## Login Screen

Purpose:
- authenticate the user
- store `access_token`
- fetch current user profile
- redirect by role

Main API calls:
- `POST /auth/login`
- `GET /auth/me`

Suggested UI:
- username input
- password input
- login button
- invalid credential error state

Success flow:
1. call `POST /auth/login`
2. store `access_token`
3. call `GET /auth/me` or use returned user payload
4. redirect to `/monitor`

## Register Screen

Purpose:
- allow `developer` and `manager` to create users

Main API call:
- `POST /users`

Allowed roles:
- `developer`: can create `developer`, `manager`, `teacher`
- `manager`: can create `manager`, `teacher`

Suggested UI:
- username
- password
- role selector
- `teacher_id` field shown only when role is `teacher`
- active toggle
- create button

Frontend rules:
- hide this screen for `teacher`
- if current role is `manager`, do not show `developer` as a selectable role
- if selected role is not `teacher`, do not send `teacher_id`

## Monitor Screen

Purpose:
- serve as the main app screen after login
- render content based on the current role

### Developer / Manager View

Suggested sections:
- class list
- leave request list
- replacement suggestions
- replacement assignment
- teacher list
- optional quick links to create teacher or manage users

Main APIs:
- `GET /classes`
- `GET /leave-requests`
- `GET /teachers`
- `GET /classes/{class_id}/replacement-suggestions`
- `PUT /classes/{class_id}/assign-replacement`

### Teacher View

Suggested sections:
- my classes
- my leave requests
- create leave request
- cancel my leave request when status is `REQUESTED`

Main APIs:
- `GET /classes`
- `GET /leave-requests`
- `POST /leave-requests`
- `PUT /leave-requests/{request_id}/cancel`

## Auth Guard Rules

- if no token is stored, redirect to `/login`
- if token is invalid or expired, clear local auth state and redirect to `/login`
- if a `teacher` attempts to access `/register`, redirect to `/monitor`

## Recommended Frontend State

Keep a small auth state:
- `accessToken`
- `currentUser`
- `isAuthenticated`

Useful derived values:
- `isDeveloper`
- `isManager`
- `isTeacher`

## Recommended Build Order

1. login flow
2. auth guard and current user state
3. role-based monitor layout
4. register screen for `developer` and `manager`
5. teacher leave-request actions
6. manager/developer replacement workflow

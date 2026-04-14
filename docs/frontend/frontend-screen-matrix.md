# Frontend Screen Matrix

## Scope

Initial frontend scope includes three screens:
- `Login`
- `Register`
- `Monitor`
- `Profile Settings`

The `Register` screen is an internal user creation screen, not a public self-signup page.

## Route Map

| Route | Requires login | Allowed roles | Purpose |
|---|---|---|---|
| `/login` | No | Public | Authenticate and receive `access_token` |
| `/register` | Yes | `developer`, `manager` | Create new users |
| `/monitor` | Yes | `developer`, `manager`, `teacher` | Main dashboard / working screen |
| `/profile-settings` | Yes | `developer`, `manager`, `teacher` | Manage profile image, password, and teacher basic profile info such as phone, email, ELO, and education score |

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
- user code input
- password input
- show/hide password action
- forgot-password action
- login button
- invalid credential error state

Success flow:
1. call `POST /auth/login`
2. store `access_token`
3. call `GET /auth/me` or use returned user payload
4. redirect to `/monitor`

Forgot password flow:
1. user clicks `Forgot password?`
2. frontend expands an inline support panel
3. user submits user code
4. frontend calls `POST /password-reset-requests`
5. frontend shows a message that reset is handled internally by a `manager` or `developer`

## Register Screen

Purpose:
- allow `developer` and `manager` to manage internal user access

Main API call:
- `POST /users`

Allowed roles:
- `developer`: can create `developer`, `manager`, `teacher`
- `manager`: can create `manager`, `teacher`

Suggested UI:
- role selector
- create button
- success state showing the generated `user_code`

Teacher account mode:
- `name`
- `contact`
- `email`
- `elo`
- `max_slots_per_day`
- optional multiple preference rows
- center dropdown sourced from backend
- 24-hour `HH:MM` time inputs for preferences

Staff account mode:
- `display_name`

Frontend rules:
- hide this screen for `teacher`
- if current role is `manager`, do not show `developer` as a selectable role
- if selected role is `teacher`, do not ask for `teacher_id` or password

## Profile Settings Screen

Purpose:
- allow any authenticated user to manage their own profile settings

Main API call:
- `PUT /auth/profile/image`
- `PUT /auth/profile/password`

Suggested UI:
- profile image upload
- current password
- new password
- confirm new password
- success or validation error state

## Monitor Screen

Purpose:
- serve as the main app screen after login
- render content based on the current role

### Developer / Manager View

Suggested sections:
- class list
- leave request list
- center shown in class and leave request views
- teacher list with inline active `Yes/No` dropdown
- leave request approval and reject actions
- assignment queue for classes with `OPEN` or `NEED_REPLACEMENT`
- load ranked replacement suggestions
- assign replacement teacher directly from monitor
- password reset request inbox
- teacher list
- quick links to create users or review password reset requests

Main APIs:
- `GET /classes`
- `GET /leave-requests`
- `PUT /leave-requests/{request_id}/approve`
- `PUT /leave-requests/{request_id}/reject`
- `GET /teachers`
- `GET /teachers/me`
- `PUT /teachers/{teacher_id}`
- `GET /password-reset-requests`
- `PUT /password-reset-requests/{request_id}/reset-default`
- `GET /classes/{class_id}/replacement-suggestions`
- `PUT /classes/{class_id}/assign-replacement`

### Teacher View

Suggested sections:
- my classes
- my leave requests
- center shown with classes and leave requests
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
- `/profile-settings` is available to any authenticated role

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
5. manager/developer user management and password reset flow
6. teacher leave-request actions
7. manager/developer replacement workflow

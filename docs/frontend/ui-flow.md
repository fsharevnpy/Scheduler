# Frontend UI Flow

## Main Routes

- `/login`
- `/register`
- `/monitor`
- `/profile-settings`

## Entry Flow

### Not authenticated

1. User opens the app
2. Frontend checks whether an `access_token` exists
3. If no token is available, redirect to `/login`

### Authenticated

1. Frontend loads the stored `access_token`
2. Frontend calls `GET /auth/me`
3. If the token is valid, route access is decided by role
4. If the token is invalid or expired, clear auth state and redirect to `/login`

## Login Flow

Route: `/login`

1. User submits user code and password
2. Frontend calls `POST /auth/login`
3. On success:
   - store `access_token`
   - store current user info
   - redirect to `/monitor`
4. On failure:
   - stay on `/login`
   - show authentication error

Forgot password flow:
1. User clicks `Forgot password?`
2. Frontend expands an inline help panel on `/login`
3. User submits user code
4. Frontend calls `POST /password-reset-requests`
5. Frontend shows a confirmation that a `manager` or `developer` will handle the reset

## Register Flow

Route: `/register`

Allowed roles:
- `developer`
- `manager`

Rules:
- `teacher` must not access this screen
- if a `teacher` reaches `/register`, redirect to `/monitor`
- if an unauthenticated user reaches `/register`, redirect to `/login`

Create user flow:
1. Current user opens `/register`
2. Frontend loads current role
3. Frontend limits role options:
   - `developer` can create `developer`, `manager`, `teacher`
   - `manager` can create `manager`, `teacher`
4. If role = `teacher`, frontend collects teacher profile fields and optional preferences
5. If role != `teacher`, frontend collects staff account fields
6. User submits the form
7. Frontend calls `POST /users`
8. On success:
   - show confirmation
   - optionally clear the form or redirect back to `/monitor`

Password reset admin flow:
1. Current user opens `/monitor`
2. Frontend loads password reset requests
3. Frontend shows only requests the current role is allowed to manage
4. Current user can reset the requested account directly with `PUT /password-reset-requests/{request_id}/reset-default`

Profile settings flow:
1. Current user opens `/profile-settings`
2. Frontend shows a dedicated profile settings page
3. User can upload a profile image
4. Frontend calls `PUT /auth/profile/image`
5. User can update password by entering:
   - current password
   - new password
   - confirm new password
6. Frontend calls `PUT /auth/profile/password`
7. On success, frontend clears the form and shows a confirmation

## Monitor Flow

Route: `/monitor`

Allowed roles:
- `developer`
- `manager`
- `teacher`

Rules:
- if not authenticated, redirect to `/login`
- if authenticated, render content based on role

### Developer / Manager Monitor

Suggested content:
- class list
- leave request list
- leave request approve/cancel actions
- assignment queue for classes in `OPEN` or `NEED_REPLACEMENT`
- load replacement suggestions
- assign replacement teacher directly from monitor
- password reset request list
- teacher management shortcuts
- optional user management shortcut

### Teacher Monitor

Suggested content:
- my classes
- my leave requests
- create leave request
- cancel my own leave request when allowed

## Attendance history

- Dates and clock times use `Asia/Ho_Chi_Minh` (UTC+7), regardless of the device timezone.
- `Current` compares today's recorded events with the current schedule. Adjacent classes
  retain their existing check-in coverage / continued-session presentation.
- `History` shows only dates before today with recorded events; `All` includes today.
  Historical rows never infer absence or assignment from today's class configuration.
- Events are grouped by date, teacher (or user), and class, taking the latest check-in
  and checkout. An earlier checkout is not paired with a later check-in. Events without
  a matching class remain separate, visible rows. Different classes are not guessed to
  be a historical block when no recorded relationship exists.
- A row has a stable, unique identity independent of arrival order. Date/view navigation
  resets the table page, while clock updates do not reset pagination.
- New automatic and manual events save class ID, center ID and scheduled start/end times.
  Older records are not backfilled from today's schedule: unknown historical shifts
  display `-`. Deleted classes keep their saved identity on new records.
- `GET /attendance-records` remains an array response. `limit` defaults to 200 (maximum 500);
  `before_checked_at` (timezone-aware) and `before_record_id` must be supplied together.
  Ordering is descending timestamp, then UUID. The monitor follows every page before
  displaying attendance, avoiding incomplete pairs and false absence from the old cap.
  Large histories consequently take longer to load; page errors are shown, not hidden.
- Deploy backend and frontend together. The backend adds nullable snapshot columns on
  first attendance access; no database reset or manual historical backfill is required.

Validation:

```powershell
# From frontend:
npm test
npm run build
# From backend (with its requirements installed):
python -m unittest discover -s tests -p test_attendance_history.py
```

For a database-free browser regression, start the Vite dev server and open
`/tests/attendance-browser.html`. Switch the manager's History dates backward and
forward: each date must contain exactly one row, including the unmatched event.
The teacher's History must contain three rows with both check-in and checkout on
the latest historical row. On the pagination fixture, move to page 2 and refresh
rows: it must stay on page 2. This fixture is not included in the production build.

## Logout Flow

Since the current backend does not have a dedicated logout API:

1. Frontend clears local auth state
2. Remove stored `access_token`
3. Redirect to `/login`

## Recommended Navigation Rules

- successful login always goes to `/monitor`
- registration should be available from `/monitor` for `developer` and `manager`
- profile settings should be available from authenticated screens near logout
- `teacher` should never see navigation to `/register`

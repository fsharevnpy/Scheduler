# Frontend UI Flow

## Main Routes

- `/login`
- `/register`
- `/monitor`
- `/profile-settings`

## Manager navigation

- Main navigation labels are Teacher attendance, Teachers & teaching schedule, Teacher requests and Teaching reports (Vietnamese: Chấm công giáo viên, Giáo viên & lịch dạy, Yêu cầu của giáo viên, Báo cáo giảng dạy). Teacher requests retains both leave and password-reset workflows.

- `/monitor` opens on Attendance. The section tabs switch content in place, without hash links or scrolling to another section.
- The manager attendance heading shows the selected date and localized weekday in bold, without a timezone suffix. These are not repeated as table columns. Date grouping still uses Vietnam time; report date/weekday columns are unchanged.
- Teachers & classes contains account registration; Requests contains leave and password-reset workflows.
- The teacher list places active teachers before inactive teachers, preserving the existing order within each group. Sorting happens before pagination and updates after a successful active-status change. For a mixed-status demo, append `&teacherSortFixture` to the manager fixture URL.
- Reports is the single entry point for attendance statistics and Excel downloads, displayed inline rather than in a dialog.
- Sections stay mounted so switching preserves date filters, table pagination and report results. Reports mounts on first use.
- Arrow keys, Home and End navigate the section tabs. At widths up to 700px, all sections are visible in a two-column grid without horizontal swiping; the developer-only System tab spans the last row. Desktop keeps the horizontal tab strip.
- The shared account menu groups profile settings, push notifications and logout for every role.
- Developers additionally have a System tab for backups and the manager account list.

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

Visual layout:
- Chess Fighters header uses the existing logo, a subtle chessboard pattern and a
  decorative knight. Operational copy remains localized in English/Vietnamese.
- Summary cards use decorative chess-piece icons; their counts keep their existing
  meanings (attendance events are not relabeled as taught sessions).
- A tab strip switches between attendance, resources, requests and reports in place.
  There are no section jump links or duplicate report buttons.
- Reports use a dedicated inline section, a compact filter area, summary highlights
  and expandable teacher details. All report categories remain available in the table.
- On small screens summary cards use two columns, report filters reflow, and wide
  tables scroll inside their containers rather than widening the page.
- Motion is limited to brief entry/hover effects and respects reduced-motion settings.

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

- A compact shared header keeps account settings/logout in the account menu.
- A compact overview of monthly score, scheduled sessions today, leave requests and attendance events appears directly below the header, above today's session and check-in/out actions.
- The featured session reads "Center - Single session/Double session", with teaching times on a separate line. Scheduled adjacent sessions at the same center are grouped for this display; an open visit uses its saved block. Blocks longer than two show their session count rather than an inaccurate double-session label.
- Today's attendance, Attendance history, My teaching schedule and Leave Requests switch content in place. Their Vietnamese labels are "Chấm công hôm nay", "Lịch sử chấm công", "Lịch dạy của tôi" and "Đơn xin nghỉ". Mobile navigation shows all four full labels in a two-column grid.
- Attendance uses paginated cards on screens up to 700px and tables on desktop, with the same records, statuses, student names and pagination.
- History filters and pagination survive section changes. The overview labels attendance as events, not taught sessions, and no longer shows the system-wide unassigned-class count.
- Check-in is disabled when there is no assigned class today whose end time has not passed. The existing backend EARLY policy is unchanged; this is not a new 30-minute-only check-in window.
- Checkout is enabled for an open check-in today, including a saved double shift after the current assignment changes. It still requires the student roster and server-side validation.
- The API remains authoritative: `POST /attendance-records/check-in` returns HTTP 400 with `no assigned teaching session available for attendance` before inserting an attendance record if no effective assignment matches the teacher, Vietnam weekday, nearest center and unexpired session.
- The existing five-minute cooldown may return HTTP 429 first. Location outside the allowed radius remains a separately recorded invalid-location status for an otherwise matched session; it is not an assignment check.
- HTTP regression tests exercise the real route and matching helper with a mocked database, asserting no attendance INSERT/commit on an unmatched request and successful saving on a match. This is not a live PostgreSQL integration test.
- Teacher demo: `/tests/attendance-browser.html?reportFixture&view=teacher`.
  Add `&scenario=unassigned` for no classes, `&scenario=teaching` for an open double shift,
  or `&scenario=reassigned` for an open saved visit without a current assignment.
  `&historyFixture` supplies more than one page of history. Demo geolocation and writes are simulated.
- Create/cancel leave requests remain available in Leave; schedule cards localize weekday labels.

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
- New check-ins additionally save `session_block`: the selected class and forward
  contiguous classes assigned to the same teacher, at the same center and weekday.
  Checkouts save `check_in_record_id` and use this captured block even if the schedule
  subsequently changes. History expands the linked pair into one row per saved class,
  sharing the actual in/out times. Weekdays follow the selected English/Vietnamese language.
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
# From backend (install test requirements in its virtual environment first):
python -m pip install -r requirements-test.txt
python -m unittest discover -s tests -p "test_attendance*.py"
```

For a database-free browser regression, start the Vite dev server and open
`/tests/attendance-browser.html`. Switch the manager's History dates backward and
forward: each date must contain exactly one row, including the unmatched event.
The teacher's History must contain three rows with both check-in and checkout on
the latest historical row. On the pagination fixture, move to page 2 and refresh
rows: it must stay on page 2. This fixture is not included in the production build.

## Students recorded at checkout

- Before recording checkout, a teacher enters a positive whole **number of students**
  and a matching list of names, one separate input per student. Zero students, missing names
  and a count/list mismatch are rejected before requesting location and again by the API.
  Names are trimmed, limited to 150 characters each, and cannot contain control
  characters. Children with identical names are retained as separate entries.
  The joined list is limited to Excel's 32,767-character cell limit so exports do
  not silently truncate names.
- Changing the count creates numbered name inputs. The keyboard's Next/Enter
  action moves focus without submitting the checkout; there are no per-name buttons.
  The last field's Done action dismisses the keyboard; checkout still needs explicit
  confirmation. Reducing the count excludes extra names from submission but retains
  them in the current form draft if the count is increased again.
- One list covers the **whole attendance visit**, including a double/consecutive
  shift block. It is not a separate roster per class and is not a unique-student
  total across days. Existing session-count and attendance-status rules are unchanged.
- `POST /attendance-records/check-out` requires `student_count` (integer) and
  `student_names` (array of strings), alongside the existing location fields.
  `POST /attendance-records/manual` requires the same fields for `CHECK_OUT`;
  check-in still does not require student details.
- The validated list is saved on the checkout record in nullable
  `attendance_records.student_names` (JSONB) in the same transaction as the checkout.
  The count is derived from the saved list, avoiding two conflicting stored counts.
  The normal schema initializer adds the column to existing databases; new database
  initialization includes it too.
- `GET /attendance-records` returns the list and its count. Teacher access remains
  scoped to that teacher's own account; reports and manual records remain restricted
  to managers/developers.
- Current/history tables, the manager's teacher detail panel and report visit details
  show a clickable student count that expands to the names. A saved double shift can
  show the same list on its individual class rows, labeled as shared for the visit.
- JSON report `sessions` and per-class `details` contain `student_names` and
  `student_count`. Excel teacher/center detail sheets append **Students in visit** and
  **Student names (whole visit)**. Each visit is exported once; names are plain text,
  never formulas. No student totals are inferred or multiplied by the block size.
- Old records return `null` and display a localized **Not recorded**, not zero.
  Names are user data and are never
  translated. UI labels and Excel column headings follow English/Vietnamese selection.
- While location/save is pending, checkout inputs and confirmation are disabled.
  A failed save retains the entered names for retry; successful completion clears them.
- Deploy backend and frontend together and refresh installed/browser clients.
  Old clients without student fields will receive an explicit 422 response at checkout;
  no database volume reset or historical backfill is needed.
- The browser fixture supports checkout callbacks with synthetic names:
  `globalThis.checkoutStudentPayload`, `globalThis.manualStudentPayload` and
  `globalThis.failCheckoutFixture` support validation and failed-save retry checks.
  Geolocation must be stubbed during fixture testing; it does not write to a real DB.

## Teacher attendance statistics and monthly reports

- Managers and developers open the **Reports** tab.
  Teachers cannot access either report API.
- Choose one teacher or all teachers, then a calendar month or a custom inclusive
  date range of up to 366 days. The default is the previous month in Vietnam time.
- **View statistics** previews a summary and expandable detail for each teacher.
  **Download Excel** uses the same teacher, date range and language. The workbook
  contains a summary sheet and one detail sheet per teacher, including weekdays,
  saved shift times, actual in/out times, results and review notes.
- Counts are evidence-based, not an estimate from the current assignment:
  - **Recorded sessions** = confirmed sessions + sessions requiring review.
  - **Confirmed sessions** require saved shift times, valid/manual attendance and a
    linked in/out pair covering the entire shift. Repeated records do not double count
    a teacher/date/class. Confirmed minutes use the scheduled duration, not overtime.
  - **Sessions to review** include late arrival, early departure, missing in/out,
    invalid location or missing historical linkage. These are warnings, not absences,
    and remain separate from confirmed totals.
  - **Unverified events** lack sufficient historical shift evidence or have invalid
    saved intervals. They are not silently treated as taught or absent.
- Example: 07:00-08:30 and 08:30-11:00, with one linked 07:00/11:00 pair, count as
  **two confirmed sessions / 240 minutes**. Arriving at 07:05 makes only the first
  session reviewable; leaving at 10:30 makes only the second reviewable.
- Existing events are not retrospectively linked across different classes using
  today's schedule. An explicit link plus an individual saved shift can verify that
  single class, but cannot invent an older double shift.
- Endpoints: `GET /attendance-records/report` (JSON) and
  `GET /attendance-records/export` (XLSX). Both accept `start_date`, `end_date`,
  optional `teacher_id`, and `language=vi|en`. Filtering uses Vietnam day boundaries.
- Manager controls, status labels, weekdays, report labels and workbook headings
  follow the selected language. Names, identifiers and user-entered notes are not
  translated. Action confirmations are translated at render time when switching language.
- Changing report filters/language or leaving the monitor cancels the pending request,
  preventing old results from overwriting a new selection. Switching monitor tabs keeps
  the report mounted, including its filters, pending request and results.
- For database-free report UI checks, open
  `/tests/attendance-browser.html?reportFixture`. It supplies test responses, including
  a mock download (not a real workbook). `globalThis.attendanceReportRequests` records
  preview/export filters; `globalThis.attendanceReportDelay` allows cancellation checks.
  Real workbook contents and double-shift calculations are covered by backend tests.
- Append `&view=manager` for the manager-only demo, or `&view=developer` to include
  the System tab. Check in both languages at 320, 390, 700 and 1440px:
  - Only one main panel is visible, with no vertical jump or URL hash change on tab selection.
  - Select an older attendance date, switch away and return: filters and pagination remain.
  - Preview a report, switch away and return: period and results remain; Excel uses that period.
  - All mobile navigation labels are visible without horizontal swiping. Arrow keys/Home/End still select tabs.
  - Account settings open inside the viewport; Escape and an outside click close the menu.
- Rebuild both services after updating the source:

  ```powershell
  docker compose up -d --build backend frontend
  docker compose restart gateway
  ```

  Nullable snapshot/link columns are added through the existing schema initialization.
  Do not remove database volumes. Tests mock database access; a real PostgreSQL
  integration check is still required in the deployment environment.

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

# Scheduler

Scheduler is a role-based scheduling backend for managing teachers, classes, leave requests, and replacement teacher assignment.

Current roles:
- `developer`
- `manager`
- `teacher`

Main capabilities:
- authentication with generated `user_code` and access token
- role-based API authorization
- internal forgot-password request flow
- approval-based password reset to default password
- teacher and class management
- teacher account creation with auto-generated `teacher_id`
- leave request workflow
- replacement teacher suggestion and assignment

## Project Structure

- [`backend`](backend): FastAPI backend
- [`frontend`](frontend): frontend app
- [`docs`](docs): architecture and logic docs

## Deploy

Requirements:
- Docker
- Docker Compose

Start the full stack:

```powershell
docker compose up -d --build
```

Rebuild only one service:

```powershell
docker compose up -d --build backend
docker compose up -d --build frontend
docker compose up -d --build db
```

Reset containers and database volume, then recreate everything:

```powershell
docker compose down -v
docker compose up -d --build
```

Notes:
- PostgreSQL init scripts in [`backend/db`](backend/db) run only when the database volume is created from scratch.
- If you change schema or seed data and want those changes applied automatically, use `docker compose down -v` first.

## Logs

View logs for the full stack:

```powershell
docker compose logs
```

Follow logs in real time:

```powershell
docker compose logs -f
```

View logs for a specific service:

```powershell
docker compose logs backend
docker compose logs frontend
docker compose logs db
```

Follow logs for a specific service:

```powershell
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f db
```

## Default Accounts

Available after reseeding the database:

- `2603000 / dev123` for `developer`
- `2603001 / manager123` for `manager`
- `2603002 / teacher123` for `teacher`
- `2603003 / teacher123` for `teacher`
- `2603004 / teacher123` for `teacher`
- `2603005 / teacher123` for `teacher`
- `2603006 / teacher123` for `teacher`
- `2603007 / teacher123` for `teacher`
- `2603008 / teacher123` for `teacher`
- `2603009 / teacher123` for `teacher`

Use `user_code` and password to sign in.
Each account also has a `display_name` used across the UI.
New teacher accounts are created with a generated `teacher_id` and temporary password `123456aA@`.

Seeded centers:
- `Quan 9 (CS1)`
- `Thu Duc (CS2)`
- `Binh Thanh (CS3)`

## Backend Notes

Replacement suggestion scoring:
- teacher score is normalized to `[0, 1]` using min-max scaling across the full `teachers` table
- final score = `normalized_score * 0.4 + center_match * 0.3 + time_match * 0.3`
- `center_match` and `time_match` are binary values (`0` or `1`)

## Docs

### Backend

- [`docs/backend/api-matrix.md`](docs/backend/api-matrix.md): endpoint list, roles, and API purpose
- [`docs/backend/business-rules.md`](docs/backend/business-rules.md): current backend business rules
- [`docs/backend/backend-auth-flow.drawio`](docs/backend/backend-auth-flow.drawio): login and authorization flow
- [`docs/backend/leave-request-flow.drawio`](docs/backend/leave-request-flow.drawio): leave request flow
- [`docs/backend/replacement-flow.drawio`](docs/backend/replacement-flow.drawio): replacement suggestion and assignment flow

### Frontend

- [`docs/frontend/frontend-screen-matrix.md`](docs/frontend/frontend-screen-matrix.md): initial screen plan, route guards, and API mapping
- [`docs/frontend/ui-flow.md`](docs/frontend/ui-flow.md): basic route and navigation flow for login, register, and monitor

### Database

- [`docs/db/data-model.md`](docs/db/data-model.md): table overview, relationships, and schema entry points

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
- request-based password reset to default password
- profile image delivery through MinIO object storage
- teacher self-service phone and personal email changes
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

```powershell/bash
docker compose up -d --build
```

Use the gateway URL for normal access:

- app: `http://localhost:8080`
- API: `http://localhost:8080/api`
- API docs: `http://localhost:8080/api/docs`
- profile images: `http://localhost:8080/storage/...`
- MinIO console: `http://localhost:9101`

Do not use `localhost:3000` directly after this change. Frontend and backend are now intended to run behind the gateway.

Rebuild only one service:

```powershell/bash
docker compose up -d --build backend
docker compose up -d --build frontend
docker compose up -d --build db
docker compose up -d --build gateway
docker compose up -d --build minio
```

Reset containers and database volume, then recreate everything:

```powershell/bash
docker compose down -v
docker compose up -d --build
```

Notes:
- PostgreSQL init scripts in [`backend/db`](backend/db) run only when the database volume is created from scratch.
- If you change schema or seed data and want those changes applied automatically, use `docker compose down -v` first.

## Logs

View logs for the full stack:

```powershell/bash
docker compose logs
```

Follow logs in real time:

```powershell/bash
docker compose logs -f
```

View logs for a specific service:

```powershell/bash
docker compose logs backend
docker compose logs frontend
docker compose logs db
docker compose logs gateway
docker compose logs minio
```

Follow logs for a specific service:

```powershell/bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f db
docker compose logs -f gateway
docker compose logs -f minio
```

Create a tailscale funnel:

```bash
sudo tailscale funnel --bg 8080
```

## Default Accounts

Available after reseeding the database:

- `0000000 / devchessfighter` for `developer`
- `2603001 / manager123` for `manager`
- `2603002 / teacher123` for `teacher`
- `2603003 / teacher123` for `teacher`
- `2603004 / teacher123` for `teacher`
- `2603005 / teacher123` for `teacher`
- `2603006 / teacher123` for `teacher`
- `2603007 / teacher123` for `teacher`
- `2603008 / teacher123` for `teacher`
- `2603009 / teacher123` for `teacher`
- `2603010 / teacher123` for `teacher`

Use `user_code` and password to sign in.
Each account also has a `display_name` used across the UI.
New accounts are created with the default password `123456aA@`.
New teacher accounts are also created with a generated `teacher_id`.
Teachers can edit their own phone number and personal email from Profile Settings.

Seeded centers:
- `Vạn Phúc (CS1)`
- `Cityland (CS2)`
- `Vin (CS3)`

## Backend Notes

Replacement suggestion scoring:
- teacher ELO is normalized to `[0, 1]` using min-max scaling across the full `teachers` table
- final score = `normalized_score * 0.3 + normalized_education_score * 0.2 + center_match * 0.25 + time_match * 0.25`
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

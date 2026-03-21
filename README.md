# Scheduler

Scheduler is a role-based scheduling backend for managing teachers, classes, leave requests, and replacement teacher assignment.

Current roles:
- `developer`
- `manager`
- `teacher`

Main capabilities:
- authentication with access token
- role-based API authorization
- teacher and class management
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

## Default Accounts

Available after reseeding the database:

- `developer / dev123`
- `manager / manager123`
- `gv0 / teacher123`
- `gv1 / teacher123`
- `gv2 / teacher123`

## Backend Notes

Replacement suggestion scoring:
- teacher score is normalized to `[0, 1]` using min-max scaling across the full `teachers` table
- final score = `normalized_score * 0.4 + center_match * 0.3 + time_match * 0.3`
- `center_match` and `time_match` are binary values (`0` or `1`)

## Docs

Overview docs:
- [`api-matrix.md`](docs/api-matrix.md): endpoint list, roles, and API purpose
- [`business-rules.md`](docs/business-rules.md): current backend business rules

Flow diagrams:
- [`backend-auth-flow.drawio`](docs/backend-auth-flow.drawio): login and authorization flow
- [`leave-request-flow.drawio`](docs/leave-request-flow.drawio): leave request flow
- [`replacement-flow.drawio`](docs/replacement-flow.drawio): replacement suggestion and assignment flow

# backendGO

Go rewrite scaffold of the current FastAPI backend.

Principles:
- keep the existing `backend/` folder untouched
- preserve the current API paths and JSON payloads used by the frontend
- port the main auth, user, teacher, class, leave, password reset, and replacement flows

Notes:
- the local machine did not have the Go toolchain available when this source was generated
- `docker-compose.yml` still points to `backend/`, not `backendGO/`
- you should run `go mod tidy` and `go build ./cmd/api` after installing Go

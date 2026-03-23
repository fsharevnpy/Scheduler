package httpapi

import (
	"context"
	"net/http"
	"strings"

	"scheduler/backendGO/internal/domain"
	"scheduler/backendGO/internal/security"

	"github.com/jackc/pgx/v5"
)

type contextKey string

const currentUserKey contextKey = "currentUser"

func (s *Server) authenticated(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		headerValue := strings.TrimSpace(r.Header.Get("Authorization"))
		if !strings.HasPrefix(headerValue, "Bearer ") {
			s.writeError(w, http.StatusUnauthorized, "missing authorization token")
			return
		}
		tokenValue := strings.TrimSpace(strings.TrimPrefix(headerValue, "Bearer "))
		claims, err := security.DecodeAccessToken(s.cfg.SecretKey, tokenValue)
		if err != nil {
			s.writeError(w, http.StatusUnauthorized, "invalid or expired token")
			return
		}

		row, err := pgx.RowToStructByName[domain.UserRow](s.db.QueryRow(r.Context(), `
			SELECT user_id, user_code, display_name, role, teacher_id, active
			FROM users
			WHERE user_code = $1
		`, claims.Subject))
		if err != nil {
			if err == pgx.ErrNoRows {
				s.writeError(w, http.StatusUnauthorized, "user is inactive or not found")
				return
			}
			s.writeError(w, http.StatusInternalServerError, "database error")
			return
		}
		if !row.Active {
			s.writeError(w, http.StatusUnauthorized, "user is inactive or not found")
			return
		}

		ctx := context.WithValue(r.Context(), currentUserKey, mapUser(row))
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) requireRoles(roles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return s.authenticated(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			currentUser, ok := userFromContext(r.Context())
			if !ok {
				s.writeError(w, http.StatusUnauthorized, "missing authorization token")
				return
			}
			for _, role := range roles {
				if currentUser.Role == role {
					next.ServeHTTP(w, r)
					return
				}
			}
			s.writeError(w, http.StatusForbidden, "forbidden")
		}))
	}
}

func userFromContext(ctx context.Context) (domain.CurrentUser, bool) {
	value := ctx.Value(currentUserKey)
	user, ok := value.(domain.CurrentUser)
	return user, ok
}

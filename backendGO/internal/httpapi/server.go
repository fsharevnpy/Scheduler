package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"scheduler/backendGO/internal/config"
	"scheduler/backendGO/internal/domain"
	"scheduler/backendGO/internal/security"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Server struct {
	cfg config.Config
	db  *pgxpool.Pool
}

func NewServer(cfg config.Config, db *pgxpool.Pool) *Server {
	return &Server{cfg: cfg, db: db}
}

func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", "http://127.0.0.1:3000"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/", s.root)
	r.Get("/health", s.health)

	r.Route("/auth", func(r chi.Router) {
		r.Post("/login", s.login)
		r.With(s.authenticated).Get("/me", s.getMe)
		r.With(s.authenticated).Put("/change-password", s.changePassword)
	})

	r.With(s.requireRoles(domain.RoleDeveloper, domain.RoleManager, domain.RoleTeacher)).Get("/centers", s.getCenters)
	r.With(s.authenticated).Get("/classes", s.getClasses)
	r.With(s.requireRoles(domain.RoleDeveloper, domain.RoleManager)).Post("/classes", s.createClass)
	r.With(s.requireRoles(domain.RoleDeveloper, domain.RoleManager)).Put("/classes/{classID}", s.updateClass)
	r.With(s.requireRoles(domain.RoleDeveloper, domain.RoleManager)).Get("/teachers", s.getTeachers)
	r.With(s.requireRoles(domain.RoleDeveloper, domain.RoleManager)).Put("/teachers/{teacherID}", s.updateTeacher)
	r.With(s.requireRoles(domain.RoleDeveloper, domain.RoleManager)).Get("/users", s.getUsers)
	r.With(s.requireRoles(domain.RoleDeveloper, domain.RoleManager)).Post("/users", s.createUser)
	r.With(s.requireRoles(domain.RoleDeveloper, domain.RoleManager)).Delete("/users/{userCode}", s.deleteUser)
	r.With(s.authenticated).Get("/leave-requests", s.getLeaveRequests)
	r.With(s.authenticated).Post("/leave-requests", s.createLeaveRequest)
	r.With(s.requireRoles(domain.RoleDeveloper, domain.RoleManager)).Put("/leave-requests/{requestID}/approve", s.approveLeaveRequest)
	r.With(s.authenticated).Put("/leave-requests/{requestID}/cancel", s.cancelLeaveRequest)
	r.Post("/password-reset-requests", s.createPasswordResetRequest)
	r.With(s.authenticated).Get("/password-reset-requests", s.getPasswordResetRequests)
	r.With(s.requireRoles(domain.RoleDeveloper, domain.RoleManager)).Put("/password-reset-requests/{requestID}/reset-default", s.resetPasswordFromRequest)
	r.With(s.requireRoles(domain.RoleDeveloper, domain.RoleManager)).Get("/classes/{classID}/replacement-suggestions", s.getReplacementSuggestions)
	r.With(s.requireRoles(domain.RoleDeveloper, domain.RoleManager)).Put("/classes/{classID}/assign-replacement", s.assignReplacement)

	return r
}

func (s *Server) writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func (s *Server) writeError(w http.ResponseWriter, status int, detail string) {
	s.writeJSON(w, status, map[string]string{"detail": detail})
}

func (s *Server) decodeJSON(r *http.Request, target any) error {
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	return decoder.Decode(target)
}

func normalizeOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func formatDate(value time.Time) string {
	return value.Format("2006-01-02")
}

func formatTimeValue(value time.Time) string {
	return value.Format("15:04:05")
}

func parseDate(value string) (time.Time, error) {
	return time.Parse("2006-01-02", strings.TrimSpace(value))
}

func parseClock(value string) (time.Time, error) {
	return time.Parse("15:04", strings.TrimSpace(value))
}

func manageableRoles(currentUser domain.CurrentUser) []string {
	switch currentUser.Role {
	case domain.RoleDeveloper:
		return []string{domain.RoleDeveloper, domain.RoleManager, domain.RoleTeacher}
	case domain.RoleManager:
		return []string{domain.RoleManager, domain.RoleTeacher}
	default:
		return []string{}
	}
}

func mapUser(row domain.UserRow) domain.CurrentUser {
	return domain.CurrentUser{
		UserID:      row.UserID,
		UserCode:    row.UserCode,
		DisplayName: row.DisplayName,
		Role:        row.Role,
		TeacherID:   row.TeacherID,
		Active:      row.Active,
	}
}

func validateChangePassword(req domain.ChangePasswordRequest) error {
	if err := security.ValidatePasswordPolicy(req.NewPassword); err != nil {
		return err
	}
	if req.NewPassword != req.ConfirmNewPassword {
		return errors.New("confirm_new_password must match new_password")
	}
	return nil
}

func collectRows[T any](rows pgx.Rows) ([]T, error) {
	return pgx.CollectRows(rows, pgx.RowToStructByName[T])
}

func contains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

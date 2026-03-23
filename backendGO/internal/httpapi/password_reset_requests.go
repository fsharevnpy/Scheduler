package httpapi

import (
	"net/http"
	"time"

	"scheduler/backendGO/internal/domain"
	"scheduler/backendGO/internal/security"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (s *Server) createPasswordResetRequest(w http.ResponseWriter, r *http.Request) {
	var payload domain.PasswordResetRequestCreate
	if err := s.decodeJSON(r, &payload); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var active bool
	err := s.db.QueryRow(r.Context(), `
		SELECT active
		FROM users
		WHERE user_code = $1
	`, payload.UserCode).Scan(&active)
	if err != nil {
		s.writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if !active {
		s.writeError(w, http.StatusBadRequest, "user is inactive")
		return
	}
	if err := s.db.QueryRow(r.Context(), `
		SELECT 1
		FROM password_reset_requests
		WHERE user_code = $1
		  AND status = 'REQUESTED'
	`, payload.UserCode).Scan(new(int)); err == nil {
		s.writeError(w, http.StatusBadRequest, "active password reset request already exists")
		return
	}

	requestID := uuid.NewString()
	if _, err := s.db.Exec(r.Context(), `
		INSERT INTO password_reset_requests (request_id, user_code, status, request_note)
		VALUES ($1, $2, 'REQUESTED', $3)
	`, requestID, payload.UserCode, normalizeOptionalString(payload.RequestNote)); err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}

	s.writeJSON(w, http.StatusOK, map[string]string{
		"message":    "password reset request created",
		"request_id": requestID,
		"user_code":  payload.UserCode,
	})
}

func (s *Server) getPasswordResetRequests(w http.ResponseWriter, r *http.Request) {
	currentUser, _ := userFromContext(r.Context())
	query := `
		SELECT
			pr.request_id,
			pr.user_code,
			u.display_name,
			pr.status,
			pr.request_note,
			pr.resolution_note,
			pr.created_at,
			pr.resolved_by,
			pr.resolved_at,
			u.role AS user_role
		FROM password_reset_requests pr
		JOIN users u ON u.user_code = pr.user_code
	`
	args := []any{}
	switch currentUser.Role {
	case domain.RoleTeacher:
		query += ` WHERE pr.user_code = $1`
		args = append(args, currentUser.UserCode)
	case domain.RoleDeveloper, domain.RoleManager:
		query += ` WHERE u.role = ANY($1)`
		args = append(args, manageableRoles(currentUser))
	default:
		s.writeError(w, http.StatusForbidden, "forbidden")
		return
	}
	query += ` ORDER BY pr.created_at DESC`

	rows, err := s.db.Query(r.Context(), query, args...)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	requestRows, err := collectRows[domain.PasswordResetRequestRow](rows)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	response := make([]map[string]any, 0, len(requestRows))
	for _, item := range requestRows {
		var resolvedAt any
		if item.ResolvedAt != nil {
			resolvedAt = item.ResolvedAt.Format(time.RFC3339)
		}
		response = append(response, map[string]any{
			"request_id":      item.RequestID,
			"user_code":       item.UserCode,
			"display_name":    item.DisplayName,
			"status":          item.Status,
			"request_note":    item.RequestNote,
			"resolution_note": item.ResolutionNote,
			"created_at":      item.CreatedAt.Format(time.RFC3339),
			"resolved_by":     item.ResolvedBy,
			"resolved_at":     resolvedAt,
		})
	}
	s.writeJSON(w, http.StatusOK, response)
}

func (s *Server) resetPasswordFromRequest(w http.ResponseWriter, r *http.Request) {
	currentUser, _ := userFromContext(r.Context())
	requestID := chi.URLParam(r, "requestID")

	row, err := pgx.RowToStructByName[domain.PasswordResetRequestRow](s.db.QueryRow(r.Context(), `
		SELECT
			pr.request_id,
			pr.user_code,
			u.display_name,
			pr.status,
			pr.request_note,
			pr.resolution_note,
			pr.created_at,
			pr.resolved_by,
			pr.resolved_at,
			u.role AS user_role
		FROM password_reset_requests pr
		JOIN users u ON u.user_code = pr.user_code
		WHERE pr.request_id = $1
	`, requestID))
	if err != nil {
		s.writeError(w, http.StatusNotFound, "password reset request not found")
		return
	}
	if row.Status != "REQUESTED" {
		s.writeError(w, http.StatusBadRequest, "password reset request is already processed")
		return
	}
	if !contains(manageableRoles(currentUser), row.UserRole) {
		s.writeError(w, http.StatusForbidden, "forbidden to reset password for this role")
		return
	}

	passwordHash, err := security.HashPassword(s.cfg.DefaultResetUserPassword)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "password hashing failed")
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer tx.Rollback(r.Context())

	_, _ = tx.Exec(r.Context(), `UPDATE users SET password_hash = $1 WHERE user_code = $2`, passwordHash, row.UserCode)
	_, _ = tx.Exec(r.Context(), `
		UPDATE password_reset_requests
		SET status = 'RESOLVED',
			resolution_note = $1,
			resolved_by = $2,
			resolved_at = NOW()
		WHERE request_id = $3
	`, "Password reset to default password", currentUser.UserCode, requestID)
	if err := tx.Commit(r.Context()); err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}

	s.writeJSON(w, http.StatusOK, map[string]any{
		"message":          "password reset to default completed",
		"request_id":       requestID,
		"status":           "RESOLVED",
		"default_password": s.cfg.DefaultResetUserPassword,
	})
}

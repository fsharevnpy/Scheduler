package httpapi

import (
	"net/http"

	"scheduler/backendGO/internal/domain"
	"scheduler/backendGO/internal/security"

	"github.com/jackc/pgx/v5"
)

type authUserRow struct {
	UserID       string  `db:"user_id"`
	UserCode     string  `db:"user_code"`
	DisplayName  string  `db:"display_name"`
	PasswordHash string  `db:"password_hash"`
	Role         string  `db:"role"`
	TeacherID    *string `db:"teacher_id"`
	Active       bool    `db:"active"`
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var payload domain.LoginRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	row, err := pgx.RowToStructByName[authUserRow](s.db.QueryRow(r.Context(), `
		SELECT user_id, user_code, display_name, password_hash, role, teacher_id, active
		FROM users
		WHERE user_code = $1
	`, payload.UserCode))
	if err != nil {
		s.writeError(w, http.StatusUnauthorized, "invalid user code or password")
		return
	}
	if !row.Active || !security.VerifyPassword(payload.Password, row.PasswordHash) {
		s.writeError(w, http.StatusUnauthorized, "invalid user code or password")
		return
	}

	token, err := security.CreateAccessToken(
		s.cfg.SecretKey,
		row.UserCode,
		row.Role,
		row.TeacherID,
		s.cfg.AccessTokenExpireMinutes,
	)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "token creation failed")
		return
	}

	s.writeJSON(w, http.StatusOK, domain.TokenResponse{
		AccessToken: token,
		TokenType:   "bearer",
		ExpiresIn:   s.cfg.AccessTokenExpireMinutes * 60,
		User: domain.CurrentUser{
			UserID:      row.UserID,
			UserCode:    row.UserCode,
			DisplayName: row.DisplayName,
			Role:        row.Role,
			TeacherID:   row.TeacherID,
			Active:      row.Active,
		},
	})
}

func (s *Server) getMe(w http.ResponseWriter, r *http.Request) {
	currentUser, ok := userFromContext(r.Context())
	if !ok {
		s.writeError(w, http.StatusUnauthorized, "missing authorization token")
		return
	}
	s.writeJSON(w, http.StatusOK, currentUser)
}

func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) {
	currentUser, ok := userFromContext(r.Context())
	if !ok {
		s.writeError(w, http.StatusUnauthorized, "missing authorization token")
		return
	}

	var payload domain.ChangePasswordRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := validateChangePassword(payload); err != nil {
		s.writeError(w, http.StatusUnprocessableEntity, err.Error())
		return
	}

	var passwordHash string
	var active bool
	err := s.db.QueryRow(r.Context(), `
		SELECT password_hash, active
		FROM users
		WHERE user_code = $1
	`, currentUser.UserCode).Scan(&passwordHash, &active)
	if err != nil || !active {
		s.writeError(w, http.StatusUnauthorized, "invalid or inactive user")
		return
	}
	if !security.VerifyPassword(payload.CurrentPassword, passwordHash) {
		s.writeError(w, http.StatusBadRequest, "current password is incorrect")
		return
	}
	if payload.CurrentPassword == payload.NewPassword {
		s.writeError(w, http.StatusBadRequest, "new password must be different from current password")
		return
	}

	newHash, err := security.HashPassword(payload.NewPassword)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "password hashing failed")
		return
	}
	if _, err := s.db.Exec(r.Context(), `
		UPDATE users
		SET password_hash = $1
		WHERE user_code = $2
	`, newHash, currentUser.UserCode); err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}

	s.writeJSON(w, http.StatusOK, map[string]string{
		"message":   "password changed",
		"user_code": currentUser.UserCode,
	})
}

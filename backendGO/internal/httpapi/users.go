package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"scheduler/backendGO/internal/domain"
	"scheduler/backendGO/internal/security"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (s *Server) getUsers(w http.ResponseWriter, r *http.Request) {
	currentUser, _ := userFromContext(r.Context())
	rows, err := s.db.Query(r.Context(), `
		SELECT user_id, user_code, display_name, role, teacher_id, active
		FROM users
		WHERE role = ANY($1)
		ORDER BY role, user_code
	`, manageableRoles(currentUser))
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	users, err := collectRows[domain.UserRow](rows)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	s.writeJSON(w, http.StatusOK, users)
}

func (s *Server) createUser(w http.ResponseWriter, r *http.Request) {
	currentUser, _ := userFromContext(r.Context())
	var payload domain.UserCreateRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !contains(manageableRoles(currentUser), payload.Role) {
		s.writeError(w, http.StatusForbidden, "forbidden to create this role")
		return
	}

	active := true
	if payload.Active != nil {
		active = *payload.Active
	}
	if payload.MaxSlotsPerDay == 0 {
		payload.MaxSlotsPerDay = 2
	}
	if payload.MaxSlotsPerDay <= 0 {
		s.writeError(w, http.StatusUnprocessableEntity, "max_slots_per_day must be greater than 0")
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer tx.Rollback(r.Context())

	userCode, err := generateUserCode(r.Context(), tx)
	if err != nil {
		s.writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	var teacherID *string
	var displayName string

	if payload.Role == domain.RoleTeacher {
		if payload.TeacherID != nil || payload.DisplayName != nil {
			s.writeError(w, http.StatusUnprocessableEntity, "teacher_id and display_name are generated automatically for teacher role")
			return
		}
		name := normalizeOptionalString(payload.Name)
		contact := normalizeOptionalString(payload.Contact)
		if name == nil {
			s.writeError(w, http.StatusUnprocessableEntity, "name is required for teacher role")
			return
		}
		if contact == nil {
			s.writeError(w, http.StatusUnprocessableEntity, "contact is required for teacher role")
			return
		}

		newTeacherID, err := generateTeacherID(r.Context(), tx)
		if err != nil {
			s.writeError(w, http.StatusInternalServerError, "database error")
			return
		}
		teacherID = &newTeacherID
		displayName = *name

		if _, err := tx.Exec(r.Context(), `
			INSERT INTO teachers (teacher_id, name, contact, score, max_slots_per_day, active)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, newTeacherID, *name, *contact, payload.Score, payload.MaxSlotsPerDay, active); err != nil {
			s.writeError(w, http.StatusInternalServerError, "database error")
			return
		}

		for _, preference := range payload.Preferences {
			if !domain.ValidDayOfWeek[preference.DayOfWeek] {
				s.writeError(w, http.StatusUnprocessableEntity, "invalid day_of_week")
				return
			}
			if err := tx.QueryRow(r.Context(), `SELECT 1 FROM centers WHERE center_id = $1`, preference.PreferredCenterID).Scan(new(int)); err != nil {
				s.writeError(w, http.StatusNotFound, "center not found: "+preference.PreferredCenterID)
				return
			}
			startTime, err := parseClock(preference.PreferredStartTime)
			if err != nil {
				s.writeError(w, http.StatusUnprocessableEntity, "preferred_start_time must use HH:MM")
				return
			}
			endTime, err := parseClock(preference.PreferredEndTime)
			if err != nil {
				s.writeError(w, http.StatusUnprocessableEntity, "preferred_end_time must use HH:MM")
				return
			}
			if !startTime.Before(endTime) {
				s.writeError(w, http.StatusUnprocessableEntity, "preferred_start_time must be earlier than preferred_end_time")
				return
			}
			if _, err := tx.Exec(r.Context(), `
				INSERT INTO teacher_preferences (teacher_id, preferred_center_id, day_of_week, preferred_start_time, preferred_end_time)
				VALUES ($1, $2, $3, $4, $5)
			`, newTeacherID, preference.PreferredCenterID, preference.DayOfWeek, startTime, endTime); err != nil {
				s.writeError(w, http.StatusInternalServerError, "database error")
				return
			}
		}
	} else {
		if payload.TeacherID != nil || payload.Name != nil || payload.Contact != nil || len(payload.Preferences) > 0 {
			s.writeError(w, http.StatusUnprocessableEntity, "teacher-specific fields are only allowed for teacher role")
			return
		}
		display := normalizeOptionalString(payload.DisplayName)
		if display == nil {
			s.writeError(w, http.StatusUnprocessableEntity, "display_name is required")
			return
		}
		displayName = *display
	}

	passwordHash, err := security.HashPassword(s.cfg.DefaultNewUserPassword)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "password hashing failed")
		return
	}
	userID := uuid.NewString()
	if _, err := tx.Exec(r.Context(), `
		INSERT INTO users (user_id, user_code, display_name, password_hash, role, teacher_id, active)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, userID, userCode, displayName, passwordHash, payload.Role, teacherID, active); err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}

	s.writeJSON(w, http.StatusOK, domain.CurrentUser{
		UserID:      userID,
		UserCode:    userCode,
		DisplayName: displayName,
		Role:        payload.Role,
		TeacherID:   teacherID,
		Active:      active,
	})
}

func (s *Server) deleteUser(w http.ResponseWriter, r *http.Request) {
	currentUser, _ := userFromContext(r.Context())
	userCode := chi.URLParam(r, "userCode")

	row, err := pgx.RowToStructByName[domain.UserRow](s.db.QueryRow(r.Context(), `
		SELECT user_id, user_code, display_name, role, teacher_id, active
		FROM users
		WHERE user_code = $1
	`, userCode))
	if err != nil {
		s.writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if !contains(manageableRoles(currentUser), row.Role) {
		s.writeError(w, http.StatusForbidden, "forbidden to delete this role")
		return
	}
	if row.UserCode == currentUser.UserCode {
		s.writeError(w, http.StatusBadRequest, "cannot delete current user")
		return
	}
	if _, err := s.db.Exec(r.Context(), `DELETE FROM users WHERE user_code = $1`, userCode); err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]string{"message": "user deleted", "user_code": userCode})
}

func generateUserCode(ctx context.Context, tx pgx.Tx) (string, error) {
	prefix := time.Now().Format("0601")
	var latestUserCode string
	err := tx.QueryRow(ctx, `
		SELECT user_code
		FROM users
		WHERE user_code LIKE $1
		ORDER BY user_code DESC
		LIMIT 1
	`, prefix+"%").Scan(&latestUserCode)
	if err != nil && err != pgx.ErrNoRows {
		return "", err
	}

	nextSequence := 0
	if err == nil {
		value := strings.TrimSpace(latestUserCode)
		if len(value) >= 3 {
			lastThree := value[len(value)-3:]
			parsed, parseErr := strconv.Atoi(lastThree)
			if parseErr == nil {
				nextSequence = parsed + 1
			}
		}
	}
	if nextSequence > 999 {
		return "", errors.New("monthly user code limit reached")
	}
	return fmt.Sprintf("%s%03d", prefix, nextSequence), nil
}

func generateTeacherID(ctx context.Context, tx pgx.Tx) (string, error) {
	var latestSequence int
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(MAX(CAST(SUBSTRING(teacher_id FROM 3) AS INT)), -1)
		FROM teachers
		WHERE teacher_id ~ '^GV[0-9]+$'
	`).Scan(&latestSequence); err != nil {
		return "", err
	}
	return "GV" + strconv.Itoa(latestSequence+1), nil
}

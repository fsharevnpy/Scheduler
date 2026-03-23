package httpapi

import (
	"net/http"
	"strconv"
	"strings"

	"scheduler/backendGO/internal/domain"

	"github.com/go-chi/chi/v5"
)

func (s *Server) getTeachers(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `
		SELECT teacher_id, name, contact, score, max_slots_per_day, active
		FROM teachers
		ORDER BY teacher_id
	`)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	teachers, err := collectRows[domain.TeacherRow](rows)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	s.writeJSON(w, http.StatusOK, teachers)
}

func (s *Server) updateTeacher(w http.ResponseWriter, r *http.Request) {
	teacherID := chi.URLParam(r, "teacherID")
	var payload domain.TeacherUpdateRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := s.db.QueryRow(r.Context(), `SELECT 1 FROM teachers WHERE teacher_id = $1`, teacherID).Scan(new(int)); err != nil {
		s.writeError(w, http.StatusNotFound, "teacher not found")
		return
	}

	updates := []string{}
	args := []any{}
	push := func(field string, value any) {
		args = append(args, value)
		updates = append(updates, field+" = $"+strconv.Itoa(len(args)))
	}

	if payload.Name != nil {
		trimmed := strings.TrimSpace(*payload.Name)
		if trimmed == "" {
			s.writeError(w, http.StatusUnprocessableEntity, "name is required")
			return
		}
		push("name", trimmed)
		payload.Name = &trimmed
	}
	if payload.Contact != nil {
		trimmed := strings.TrimSpace(*payload.Contact)
		if trimmed == "" {
			s.writeError(w, http.StatusUnprocessableEntity, "contact is required")
			return
		}
		push("contact", trimmed)
	}
	if payload.Score != nil {
		push("score", *payload.Score)
	}
	if payload.MaxSlotsPerDay != nil {
		if *payload.MaxSlotsPerDay <= 0 {
			s.writeError(w, http.StatusUnprocessableEntity, "max_slots_per_day must be greater than 0")
			return
		}
		push("max_slots_per_day", *payload.MaxSlotsPerDay)
	}
	if payload.Active != nil {
		push("active", *payload.Active)
	}
	if len(updates) == 0 {
		s.writeError(w, http.StatusBadRequest, "no fields provided")
		return
	}

	args = append(args, teacherID)
	query := `UPDATE teachers SET ` + strings.Join(updates, ", ") + ` WHERE teacher_id = $` + strconv.Itoa(len(args))
	if _, err := s.db.Exec(r.Context(), query, args...); err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	if payload.Name != nil {
		_, _ = s.db.Exec(r.Context(), `
			UPDATE users
			SET display_name = $1
			WHERE teacher_id = $2
		`, *payload.Name, teacherID)
	}
	s.writeJSON(w, http.StatusOK, map[string]string{"message": "teacher updated", "teacher_id": teacherID})
}

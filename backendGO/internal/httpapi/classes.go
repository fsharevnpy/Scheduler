package httpapi

import (
	"net/http"
	"strconv"
	"strings"

	"scheduler/backendGO/internal/domain"

	"github.com/go-chi/chi/v5"
)

func (s *Server) getCenters(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(r.Context(), `
		SELECT center_id, name, room_count
		FROM centers
		ORDER BY center_id
	`)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	centers, err := collectRows[domain.CenterRow](rows)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	s.writeJSON(w, http.StatusOK, centers)
}

func (s *Server) getClasses(w http.ResponseWriter, r *http.Request) {
	currentUser, _ := userFromContext(r.Context())
	query := `
		SELECT class_id, class_date, center_id, start_time, end_time, room_no, teacher_id, status
		FROM classes
	`
	args := []any{}
	if currentUser.Role == domain.RoleTeacher {
		if currentUser.TeacherID == nil {
			s.writeError(w, http.StatusForbidden, "teacher account is not linked")
			return
		}
		query += ` WHERE teacher_id = $1`
		args = append(args, *currentUser.TeacherID)
	}
	query += ` ORDER BY class_date, start_time`

	rows, err := s.db.Query(r.Context(), query, args...)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	classRows, err := collectRows[domain.ClassRow](rows)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	response := make([]map[string]any, 0, len(classRows))
	for _, item := range classRows {
		response = append(response, map[string]any{
			"class_id":   item.ClassID,
			"class_date": formatDate(item.ClassDate),
			"center_id":  item.CenterID,
			"start_time": formatTimeValue(item.StartTime),
			"end_time":   formatTimeValue(item.EndTime),
			"room_no":    item.RoomNo,
			"teacher_id": item.TeacherID,
			"status":     item.Status,
		})
	}
	s.writeJSON(w, http.StatusOK, response)
}

func (s *Server) createClass(w http.ResponseWriter, r *http.Request) {
	var payload domain.ClassCreateRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if payload.Status == "" {
		payload.Status = "OPEN"
	}
	if !domain.ValidClassStatus[payload.Status] {
		s.writeError(w, http.StatusBadRequest, "invalid class status")
		return
	}

	classDate, err := parseDate(payload.ClassDate)
	if err != nil {
		s.writeError(w, http.StatusUnprocessableEntity, "class_date must use YYYY-MM-DD")
		return
	}
	startTime, err := parseClock(payload.StartTime)
	if err != nil {
		s.writeError(w, http.StatusUnprocessableEntity, "start_time must use HH:MM")
		return
	}
	endTime, err := parseClock(payload.EndTime)
	if err != nil {
		s.writeError(w, http.StatusUnprocessableEntity, "end_time must use HH:MM")
		return
	}
	if !startTime.Before(endTime) {
		s.writeError(w, http.StatusUnprocessableEntity, "start_time must be earlier than end_time")
		return
	}
	if payload.RoomNo <= 0 {
		s.writeError(w, http.StatusUnprocessableEntity, "room_no must be greater than 0")
		return
	}
	if err := s.db.QueryRow(r.Context(), `SELECT 1 FROM classes WHERE class_id = $1`, payload.ClassID).Scan(new(int)); err == nil {
		s.writeError(w, http.StatusBadRequest, "class_id already exists")
		return
	}
	if err := s.db.QueryRow(r.Context(), `SELECT 1 FROM centers WHERE center_id = $1`, payload.CenterID).Scan(new(int)); err != nil {
		s.writeError(w, http.StatusNotFound, "center not found")
		return
	}
	if payload.TeacherID != nil && strings.TrimSpace(*payload.TeacherID) != "" {
		if err := s.db.QueryRow(r.Context(), `SELECT 1 FROM teachers WHERE teacher_id = $1`, *payload.TeacherID).Scan(new(int)); err != nil {
			s.writeError(w, http.StatusNotFound, "teacher not found")
			return
		}
	}

	var teacherValue any
	if payload.TeacherID != nil && strings.TrimSpace(*payload.TeacherID) != "" {
		teacherValue = *payload.TeacherID
	}

	if _, err := s.db.Exec(r.Context(), `
		INSERT INTO classes (class_id, class_date, center_id, start_time, end_time, room_no, teacher_id, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, payload.ClassID, classDate, payload.CenterID, startTime, endTime, payload.RoomNo, teacherValue, payload.Status); err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]string{"message": "class created", "class_id": payload.ClassID})
}

func (s *Server) updateClass(w http.ResponseWriter, r *http.Request) {
	classID := chi.URLParam(r, "classID")
	var payload domain.ClassUpdateRequest
	if err := s.decodeJSON(r, &payload); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := s.db.QueryRow(r.Context(), `SELECT 1 FROM classes WHERE class_id = $1`, classID).Scan(new(int)); err != nil {
		s.writeError(w, http.StatusNotFound, "class not found")
		return
	}

	updates := []string{}
	args := []any{}
	push := func(field string, value any) {
		args = append(args, value)
		updates = append(updates, field+" = $"+strconv.Itoa(len(args)))
	}

	if payload.ClassDate != nil {
		classDate, err := parseDate(*payload.ClassDate)
		if err != nil {
			s.writeError(w, http.StatusUnprocessableEntity, "class_date must use YYYY-MM-DD")
			return
		}
		push("class_date", classDate)
	}
	if payload.CenterID != nil {
		if err := s.db.QueryRow(r.Context(), `SELECT 1 FROM centers WHERE center_id = $1`, *payload.CenterID).Scan(new(int)); err != nil {
			s.writeError(w, http.StatusNotFound, "center not found")
			return
		}
		push("center_id", *payload.CenterID)
	}
	if payload.StartTime != nil {
		startTime, err := parseClock(*payload.StartTime)
		if err != nil {
			s.writeError(w, http.StatusUnprocessableEntity, "start_time must use HH:MM")
			return
		}
		push("start_time", startTime)
	}
	if payload.EndTime != nil {
		endTime, err := parseClock(*payload.EndTime)
		if err != nil {
			s.writeError(w, http.StatusUnprocessableEntity, "end_time must use HH:MM")
			return
		}
		push("end_time", endTime)
	}
	if payload.RoomNo != nil {
		if *payload.RoomNo <= 0 {
			s.writeError(w, http.StatusUnprocessableEntity, "room_no must be greater than 0")
			return
		}
		push("room_no", *payload.RoomNo)
	}
	if payload.TeacherID != nil {
		if strings.TrimSpace(*payload.TeacherID) != "" {
			if err := s.db.QueryRow(r.Context(), `SELECT 1 FROM teachers WHERE teacher_id = $1`, *payload.TeacherID).Scan(new(int)); err != nil {
				s.writeError(w, http.StatusNotFound, "teacher not found")
				return
			}
			push("teacher_id", *payload.TeacherID)
		} else {
			push("teacher_id", nil)
		}
	}
	if payload.Status != nil {
		if !domain.ValidClassStatus[*payload.Status] {
			s.writeError(w, http.StatusBadRequest, "invalid class status")
			return
		}
		push("status", *payload.Status)
	}
	if len(updates) == 0 {
		s.writeError(w, http.StatusBadRequest, "no fields provided")
		return
	}

	args = append(args, classID)
	query := `UPDATE classes SET ` + strings.Join(updates, ", ") + ` WHERE class_id = $` + strconv.Itoa(len(args))
	if _, err := s.db.Exec(r.Context(), query, args...); err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	s.writeJSON(w, http.StatusOK, map[string]string{"message": "class updated", "class_id": classID})
}

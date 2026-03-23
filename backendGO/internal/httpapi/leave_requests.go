package httpapi

import (
	"net/http"
	"strings"

	"scheduler/backendGO/internal/domain"

	"github.com/go-chi/chi/v5"
)

func (s *Server) getLeaveRequests(w http.ResponseWriter, r *http.Request) {
	currentUser, _ := userFromContext(r.Context())
	query := `
		SELECT request_id, class_id, teacher_id, request_date, reason, status
		FROM leave_requests
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
	query += ` ORDER BY request_date, request_id`

	rows, err := s.db.Query(r.Context(), query, args...)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	leaveRows, err := collectRows[domain.LeaveRequestRow](rows)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	response := make([]map[string]any, 0, len(leaveRows))
	for _, item := range leaveRows {
		response = append(response, map[string]any{
			"request_id":   item.RequestID,
			"class_id":     item.ClassID,
			"teacher_id":   item.TeacherID,
			"request_date": formatDate(item.RequestDate),
			"reason":       item.Reason,
			"status":       item.Status,
		})
	}
	s.writeJSON(w, http.StatusOK, response)
}

func (s *Server) createLeaveRequest(w http.ResponseWriter, r *http.Request) {
	currentUser, _ := userFromContext(r.Context())
	var payload domain.LeaveRequestCreate
	if err := s.decodeJSON(r, &payload); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if payload.Status == "" {
		payload.Status = "REQUESTED"
	}
	if !domain.ValidLeaveStatus[payload.Status] {
		s.writeError(w, http.StatusBadRequest, "invalid leave request status")
		return
	}
	if strings.TrimSpace(payload.Reason) == "" {
		s.writeError(w, http.StatusUnprocessableEntity, "reason is required")
		return
	}
	requestDate, err := parseDate(payload.RequestDate)
	if err != nil {
		s.writeError(w, http.StatusUnprocessableEntity, "request_date must use YYYY-MM-DD")
		return
	}

	if currentUser.Role == domain.RoleTeacher {
		if currentUser.TeacherID == nil {
			s.writeError(w, http.StatusForbidden, "teacher account is not linked to a teacher record")
			return
		}
		if payload.TeacherID != *currentUser.TeacherID {
			s.writeError(w, http.StatusForbidden, "teachers can only create their own leave requests")
			return
		}
	} else if currentUser.Role != domain.RoleDeveloper && currentUser.Role != domain.RoleManager {
		s.writeError(w, http.StatusForbidden, "forbidden")
		return
	}

	if err := s.db.QueryRow(r.Context(), `SELECT 1 FROM leave_requests WHERE request_id = $1`, payload.RequestID).Scan(new(int)); err == nil {
		s.writeError(w, http.StatusBadRequest, "request_id already exists")
		return
	}

	var classTeacherID *string
	err = s.db.QueryRow(r.Context(), `
		SELECT teacher_id
		FROM classes
		WHERE class_id = $1
	`, payload.ClassID).Scan(&classTeacherID)
	if err != nil {
		s.writeError(w, http.StatusNotFound, "class not found")
		return
	}
	if classTeacherID == nil || *classTeacherID != payload.TeacherID {
		s.writeError(w, http.StatusBadRequest, "teacher is not assigned to the class")
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer tx.Rollback(r.Context())

	_, err = tx.Exec(r.Context(), `
		INSERT INTO leave_requests (request_id, class_id, teacher_id, request_date, reason, status)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, payload.RequestID, payload.ClassID, payload.TeacherID, requestDate, strings.TrimSpace(payload.Reason), payload.Status)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	_, _ = tx.Exec(r.Context(), `
		UPDATE classes
		SET status = 'NEED_REPLACEMENT'
		WHERE class_id = $1
	`, payload.ClassID)
	if err := tx.Commit(r.Context()); err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}

	s.writeJSON(w, http.StatusOK, map[string]string{"message": "leave request created", "request_id": payload.RequestID})
}

func (s *Server) approveLeaveRequest(w http.ResponseWriter, r *http.Request) {
	requestID := chi.URLParam(r, "requestID")
	var classID, status string
	err := s.db.QueryRow(r.Context(), `
		SELECT class_id, status
		FROM leave_requests
		WHERE request_id = $1
	`, requestID).Scan(&classID, &status)
	if err != nil {
		s.writeError(w, http.StatusNotFound, "leave request not found")
		return
	}
	if status == "APPROVED" {
		s.writeJSON(w, http.StatusOK, map[string]string{"message": "leave request already approved", "request_id": requestID})
		return
	}
	if status == "CANCELLED" {
		s.writeError(w, http.StatusBadRequest, "cannot approve a cancelled leave request")
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer tx.Rollback(r.Context())

	_, _ = tx.Exec(r.Context(), `UPDATE leave_requests SET status = 'APPROVED' WHERE request_id = $1`, requestID)
	_, _ = tx.Exec(r.Context(), `UPDATE classes SET status = 'NEED_REPLACEMENT' WHERE class_id = $1`, classID)
	if err := tx.Commit(r.Context()); err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}

	s.writeJSON(w, http.StatusOK, map[string]string{"message": "leave request approved", "request_id": requestID})
}

func (s *Server) cancelLeaveRequest(w http.ResponseWriter, r *http.Request) {
	currentUser, _ := userFromContext(r.Context())
	requestID := chi.URLParam(r, "requestID")

	var classID, teacherID, status string
	err := s.db.QueryRow(r.Context(), `
		SELECT class_id, teacher_id, status
		FROM leave_requests
		WHERE request_id = $1
	`, requestID).Scan(&classID, &teacherID, &status)
	if err != nil {
		s.writeError(w, http.StatusNotFound, "leave request not found")
		return
	}
	if status == "CANCELLED" {
		s.writeJSON(w, http.StatusOK, map[string]string{"message": "leave request already cancelled", "request_id": requestID})
		return
	}
	if currentUser.Role == domain.RoleTeacher {
		if currentUser.TeacherID == nil {
			s.writeError(w, http.StatusForbidden, "teacher account is not linked to a teacher record")
			return
		}
		if teacherID != *currentUser.TeacherID {
			s.writeError(w, http.StatusForbidden, "teachers can only cancel their own leave requests")
			return
		}
		if status != "REQUESTED" {
			s.writeError(w, http.StatusBadRequest, "teachers can only cancel requested leave requests")
			return
		}
	} else if currentUser.Role != domain.RoleDeveloper && currentUser.Role != domain.RoleManager {
		s.writeError(w, http.StatusForbidden, "forbidden")
		return
	}

	tx, err := s.db.Begin(r.Context())
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer tx.Rollback(r.Context())

	_, _ = tx.Exec(r.Context(), `UPDATE leave_requests SET status = 'CANCELLED' WHERE request_id = $1`, requestID)

	var remaining int
	if err := tx.QueryRow(r.Context(), `
		SELECT COUNT(*)
		FROM leave_requests
		WHERE class_id = $1
		  AND status IN ('REQUESTED', 'APPROVED')
	`, classID).Scan(&remaining); err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	if remaining == 0 {
		_, _ = tx.Exec(r.Context(), `
			UPDATE classes
			SET status = CASE WHEN teacher_id IS NULL THEN 'OPEN' ELSE 'ASSIGNED' END
			WHERE class_id = $1
		`, classID)
	}
	if err := tx.Commit(r.Context()); err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}

	s.writeJSON(w, http.StatusOK, map[string]string{"message": "leave request cancelled", "request_id": requestID})
}

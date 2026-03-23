package httpapi

import (
	"math"
	"net/http"
	"sort"
	"time"

	"scheduler/backendGO/internal/domain"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

const (
	scoreWeight       = 0.4
	centerMatchWeight = 0.3
	timeMatchWeight   = 0.3
)

type replacementTargetClass struct {
	ClassID           string    `db:"class_id"`
	ClassDate         time.Time `db:"class_date"`
	CenterID          string    `db:"center_id"`
	StartTime         time.Time `db:"start_time"`
	EndTime           time.Time `db:"end_time"`
	OriginalTeacherID *string   `db:"original_teacher_id"`
	DayOfWeek         string    `db:"day_of_week"`
}

type replacementSuggestionRow struct {
	TeacherID           string `db:"teacher_id"`
	Name                string `db:"name"`
	Score               int    `db:"score"`
	MaxSlotsPerDay      int    `db:"max_slots_per_day"`
	Active              bool   `db:"active"`
	AssignedSlotsThatDay int   `db:"assigned_slots_that_day"`
	CenterMatch         int    `db:"center_match"`
	TimeMatch           int    `db:"time_match"`
}

func (s *Server) getReplacementSuggestions(w http.ResponseWriter, r *http.Request) {
	classID := chi.URLParam(r, "classID")

	targetClass, err := pgx.RowToStructByName[replacementTargetClass](s.db.QueryRow(r.Context(), `
		SELECT
			c.class_id,
			c.class_date,
			c.center_id,
			c.start_time,
			c.end_time,
			c.teacher_id AS original_teacher_id,
			CASE
				WHEN EXTRACT(ISODOW FROM c.class_date) = 1 THEN 'T2'
				WHEN EXTRACT(ISODOW FROM c.class_date) = 2 THEN 'T3'
				WHEN EXTRACT(ISODOW FROM c.class_date) = 3 THEN 'T4'
				WHEN EXTRACT(ISODOW FROM c.class_date) = 4 THEN 'T5'
				WHEN EXTRACT(ISODOW FROM c.class_date) = 5 THEN 'T6'
				WHEN EXTRACT(ISODOW FROM c.class_date) = 6 THEN 'T7'
				ELSE 'CN'
			END AS day_of_week
		FROM classes c
		WHERE c.class_id = $1
	`, classID))
	if err != nil {
		s.writeError(w, http.StatusNotFound, "class not found")
		return
	}

	var minScore, maxScore *int
	if err := s.db.QueryRow(r.Context(), `SELECT MIN(score), MAX(score) FROM teachers`).Scan(&minScore, &maxScore); err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}

	rows, err := s.db.Query(r.Context(), `
		SELECT
			t.teacher_id,
			t.name,
			t.score,
			t.max_slots_per_day,
			t.active,
			COALESCE((
				SELECT COUNT(*)
				FROM classes c2
				WHERE c2.teacher_id = t.teacher_id
				  AND c2.class_date = $1
				  AND c2.status IN ('ASSIGNED', 'NEED_REPLACEMENT')
			), 0) AS assigned_slots_that_day,
			CASE
				WHEN EXISTS (
					SELECT 1 FROM teacher_preferences tp
					WHERE tp.teacher_id = t.teacher_id
					  AND tp.preferred_center_id = $2
				) THEN 1 ELSE 0
			END AS center_match,
			CASE
				WHEN EXISTS (
					SELECT 1 FROM teacher_preferences tp
					WHERE tp.teacher_id = t.teacher_id
					  AND tp.day_of_week = $3
					  AND tp.preferred_start_time <= $4
					  AND tp.preferred_end_time >= $5
				) THEN 1 ELSE 0
			END AS time_match
		FROM teachers t
		WHERE t.active = TRUE
		  AND ($6::varchar IS NULL OR t.teacher_id <> $6)
		  AND NOT EXISTS (
			  SELECT 1
			  FROM classes c3
			  WHERE c3.teacher_id = t.teacher_id
				AND c3.class_date = $1
				AND c3.status IN ('ASSIGNED', 'NEED_REPLACEMENT')
				AND c3.start_time < $5
				AND c3.end_time > $4
		  )
	`, targetClass.ClassDate, targetClass.CenterID, targetClass.DayOfWeek, targetClass.StartTime, targetClass.EndTime, targetClass.OriginalTeacherID)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	items, err := collectRows[replacementSuggestionRow](rows)
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}

	response := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if item.AssignedSlotsThatDay >= item.MaxSlotsPerDay {
			continue
		}
		normalizedScore := 0.0
		if minScore != nil && maxScore != nil {
			if *maxScore == *minScore {
				normalizedScore = 0.5
			} else {
				normalizedScore = float64(item.Score-*minScore) / float64(*maxScore-*minScore)
			}
		}
		finalScore := normalizedScore*scoreWeight + float64(item.CenterMatch)*centerMatchWeight + float64(item.TimeMatch)*timeMatchWeight
		response = append(response, map[string]any{
			"teacher_id":              item.TeacherID,
			"name":                    item.Name,
			"score":                   item.Score,
			"max_slots_per_day":       item.MaxSlotsPerDay,
			"active":                  item.Active,
			"assigned_slots_that_day": item.AssignedSlotsThatDay,
			"center_match":            item.CenterMatch,
			"time_match":              item.TimeMatch,
			"normalized_score":        math.Round(normalizedScore*10000) / 10000,
			"final_score":             finalScore,
		})
	}

	sort.Slice(response, func(i, j int) bool {
		return response[i]["final_score"].(float64) > response[j]["final_score"].(float64)
	})

	s.writeJSON(w, http.StatusOK, response)
}

func (s *Server) assignReplacement(w http.ResponseWriter, r *http.Request) {
	classID := chi.URLParam(r, "classID")
	var payload domain.AssignReplacementPayload
	if err := s.decodeJSON(r, &payload); err != nil {
		s.writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var classDate, startTime, endTime time.Time
	if err := s.db.QueryRow(r.Context(), `
		SELECT class_date, start_time, end_time
		FROM classes
		WHERE class_id = $1
	`, classID).Scan(&classDate, &startTime, &endTime); err != nil {
		s.writeError(w, http.StatusNotFound, "class not found")
		return
	}

	var active bool
	var maxSlotsPerDay int
	if err := s.db.QueryRow(r.Context(), `
		SELECT active, max_slots_per_day
		FROM teachers
		WHERE teacher_id = $1
	`, payload.TeacherID).Scan(&active, &maxSlotsPerDay); err != nil {
		s.writeError(w, http.StatusNotFound, "replacement teacher not found")
		return
	}
	if !active {
		s.writeError(w, http.StatusBadRequest, "replacement teacher is inactive")
		return
	}
	if err := s.db.QueryRow(r.Context(), `
		SELECT 1
		FROM classes
		WHERE teacher_id = $1
		  AND class_date = $2
		  AND class_id <> $3
		  AND status IN ('ASSIGNED', 'NEED_REPLACEMENT')
		  AND start_time < $4
		  AND end_time > $5
	`, payload.TeacherID, classDate, classID, endTime, startTime).Scan(new(int)); err == nil {
		s.writeError(w, http.StatusBadRequest, "replacement teacher has schedule conflict")
		return
	}

	var assignedCount int
	if err := s.db.QueryRow(r.Context(), `
		SELECT COUNT(*)
		FROM classes
		WHERE teacher_id = $1
		  AND class_date = $2
		  AND status IN ('ASSIGNED', 'NEED_REPLACEMENT')
	`, payload.TeacherID, classDate).Scan(&assignedCount); err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	if assignedCount >= maxSlotsPerDay {
		s.writeError(w, http.StatusBadRequest, "replacement teacher exceeds max slots per day")
		return
	}

	if _, err := s.db.Exec(r.Context(), `
		UPDATE classes
		SET teacher_id = $1,
			status = 'ASSIGNED'
		WHERE class_id = $2
	`, payload.TeacherID, classID); err != nil {
		s.writeError(w, http.StatusInternalServerError, "database error")
		return
	}

	s.writeJSON(w, http.StatusOK, map[string]string{
		"message":    "replacement assigned",
		"class_id":   classID,
		"teacher_id": payload.TeacherID,
	})
}

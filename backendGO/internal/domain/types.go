package domain

import "time"

const (
	RoleDeveloper = "developer"
	RoleManager   = "manager"
	RoleTeacher   = "teacher"
)

var (
	ValidClassStatus = map[string]bool{
		"OPEN":             true,
		"ASSIGNED":         true,
		"CANCELLED":        true,
		"NEED_REPLACEMENT": true,
	}
	ValidLeaveStatus = map[string]bool{
		"REQUESTED": true,
		"APPROVED":  true,
		"CANCELLED": true,
	}
	ValidDayOfWeek = map[string]bool{
		"T2": true,
		"T3": true,
		"T4": true,
		"T5": true,
		"T6": true,
		"T7": true,
		"CN": true,
	}
)

type CurrentUser struct {
	UserID      string  `json:"user_id"`
	UserCode    string  `json:"user_code"`
	DisplayName string  `json:"display_name"`
	Role        string  `json:"role"`
	TeacherID   *string `json:"teacher_id"`
	Active      bool    `json:"active"`
}

type TokenResponse struct {
	AccessToken string      `json:"access_token"`
	TokenType   string      `json:"token_type"`
	ExpiresIn   int         `json:"expires_in"`
	User        CurrentUser `json:"user"`
}

type LoginRequest struct {
	UserCode string `json:"user_code"`
	Password string `json:"password"`
}

type ChangePasswordRequest struct {
	CurrentPassword    string `json:"current_password"`
	NewPassword        string `json:"new_password"`
	ConfirmNewPassword string `json:"confirm_new_password"`
}

type TeacherPreferenceInput struct {
	PreferredCenterID  string `json:"preferred_center_id"`
	DayOfWeek          string `json:"day_of_week"`
	PreferredStartTime string `json:"preferred_start_time"`
	PreferredEndTime   string `json:"preferred_end_time"`
}

type UserCreateRequest struct {
	DisplayName    *string                  `json:"display_name"`
	Role           string                   `json:"role"`
	TeacherID      *string                  `json:"teacher_id"`
	Name           *string                  `json:"name"`
	Contact        *string                  `json:"contact"`
	Score          int                      `json:"score"`
	MaxSlotsPerDay int                      `json:"max_slots_per_day"`
	Preferences    []TeacherPreferenceInput `json:"preferences"`
	Active         *bool                    `json:"active"`
}

type PasswordResetRequestCreate struct {
	UserCode    string  `json:"user_code"`
	RequestNote *string `json:"request_note"`
}

type TeacherUpdateRequest struct {
	Name           *string `json:"name"`
	Contact        *string `json:"contact"`
	Score          *int    `json:"score"`
	MaxSlotsPerDay *int    `json:"max_slots_per_day"`
	Active         *bool   `json:"active"`
}

type ClassCreateRequest struct {
	ClassID   string  `json:"class_id"`
	ClassDate string  `json:"class_date"`
	CenterID  string  `json:"center_id"`
	StartTime string  `json:"start_time"`
	EndTime   string  `json:"end_time"`
	RoomNo    int     `json:"room_no"`
	TeacherID *string `json:"teacher_id"`
	Status    string  `json:"status"`
}

type ClassUpdateRequest struct {
	ClassDate *string `json:"class_date"`
	CenterID  *string `json:"center_id"`
	StartTime *string `json:"start_time"`
	EndTime   *string `json:"end_time"`
	RoomNo    *int    `json:"room_no"`
	TeacherID *string `json:"teacher_id"`
	Status    *string `json:"status"`
}

type LeaveRequestCreate struct {
	RequestID   string `json:"request_id"`
	ClassID     string `json:"class_id"`
	TeacherID   string `json:"teacher_id"`
	RequestDate string `json:"request_date"`
	Reason      string `json:"reason"`
	Status      string `json:"status"`
}

type AssignReplacementPayload struct {
	TeacherID string `json:"teacher_id"`
}

type CenterRow struct {
	CenterID  string `db:"center_id" json:"center_id"`
	Name      string `db:"name" json:"name"`
	RoomCount int    `db:"room_count" json:"room_count"`
}

type TeacherRow struct {
	TeacherID      string `db:"teacher_id" json:"teacher_id"`
	Name           string `db:"name" json:"name"`
	Contact        string `db:"contact" json:"contact"`
	Score          int    `db:"score" json:"score"`
	MaxSlotsPerDay int    `db:"max_slots_per_day" json:"max_slots_per_day"`
	Active         bool   `db:"active" json:"active"`
}

type UserRow struct {
	UserID      string  `db:"user_id" json:"user_id"`
	UserCode    string  `db:"user_code" json:"user_code"`
	DisplayName string  `db:"display_name" json:"display_name"`
	Role        string  `db:"role" json:"role"`
	TeacherID   *string `db:"teacher_id" json:"teacher_id"`
	Active      bool    `db:"active" json:"active"`
}

type ClassRow struct {
	ClassID   string    `db:"class_id"`
	ClassDate time.Time `db:"class_date"`
	CenterID  string    `db:"center_id"`
	StartTime time.Time `db:"start_time"`
	EndTime   time.Time `db:"end_time"`
	RoomNo    int       `db:"room_no"`
	TeacherID *string   `db:"teacher_id"`
	Status    string    `db:"status"`
}

type LeaveRequestRow struct {
	RequestID   string    `db:"request_id"`
	ClassID     string    `db:"class_id"`
	TeacherID   string    `db:"teacher_id"`
	RequestDate time.Time `db:"request_date"`
	Reason      string    `db:"reason"`
	Status      string    `db:"status"`
}

type PasswordResetRequestRow struct {
	RequestID      string     `db:"request_id"`
	UserCode       string     `db:"user_code"`
	DisplayName    string     `db:"display_name"`
	Status         string     `db:"status"`
	RequestNote    *string    `db:"request_note"`
	ResolutionNote *string    `db:"resolution_note"`
	CreatedAt      time.Time  `db:"created_at"`
	ResolvedBy     *string    `db:"resolved_by"`
	ResolvedAt     *time.Time `db:"resolved_at"`
	UserRole       string     `db:"user_role"`
}

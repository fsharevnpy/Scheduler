import { useEffect, useState } from "react";

import UserAvatar from "../../components/UserAvatar.jsx";
import BackupManagement from "./BackupManagement.jsx";
import DataTable from "./DataTable.jsx";
import FloatingPanel from "./FloatingPanel.jsx";
import StatusPill from "./StatusPill.jsx";
import { formatDateTimeValue, formatTimeValue, formatValue } from "./monitorUtils.js";

const ACTIVE_LEAVE_STATUSES = new Set(["REQUESTED", "APPROVED"]);
const HISTORY_LEAVE_STATUSES = new Set(["CANCELLED", "REJECTED"]);

function filterLeaveRequestsByView(leaveRequests, view) {
  if (view === "active") {
    return leaveRequests.filter((item) => ACTIVE_LEAVE_STATUSES.has(item.status));
  }

  if (view === "history") {
    return leaveRequests.filter((item) => HISTORY_LEAVE_STATUSES.has(item.status));
  }

  return leaveRequests;
}

function filterAdminAttendanceByView(attendanceRecords, view) {
  if (view === "all") {
    return attendanceRecords;
  }

  const latestByUser = new Set();
  const currentRecords = [];
  const historyRecords = [];

  attendanceRecords.forEach((record) => {
    const key = record.user_code || record.teacher_id || record.record_id;
    if (!latestByUser.has(key)) {
      latestByUser.add(key);
      currentRecords.push(record);
      return;
    }

    historyRecords.push(record);
  });

  return view === "history" ? historyRecords : currentRecords;
}

export default function AdminMonitorView({
  actionStatus,
  attendanceRecords,
  apiBase,
  token,
  leaveRequests,
  managerUsers,
  pendingAction,
  replacementQueue,
  replacementSuggestions,
  resetRequests,
  role,
  teacherScores,
  teachers,
  classes,
  onApproveLeaveRequest,
  onAssignReplacement,
  onRejectLeaveRequest,
  onLoadReplacementSuggestions,
  onResetPasswordRequest,
  onUpdateTeacherActive,
  onUpdateTeacherProfile,
  onDeleteTeacherProfileImage,
  onCreateTeacherScoreEvent,
}) {
  const [selectedLeaveRequest, setSelectedLeaveRequest] = useState(null);
  const [selectedSuggestionTeacher, setSelectedSuggestionTeacher] = useState(null);
  const [selectedAvatarTeacher, setSelectedAvatarTeacher] = useState(null);
  const [selectedProfileEdit, setSelectedProfileEdit] = useState(null);
  const [selectedScoreTeacher, setSelectedScoreTeacher] = useState(null);
  const [profileForm, setProfileForm] = useState({
    value: "",
  });
  const [profilePanelStatus, setProfilePanelStatus] = useState({ kind: "", message: "" });
  const [scoreEvents, setScoreEvents] = useState([]);
  const [scoreForm, setScoreForm] = useState({
    delta: "",
    reason: "",
    evidence_text: "",
    evidence_url: "",
  });
  const [scorePanelStatus, setScorePanelStatus] = useState({ kind: "", message: "" });
  const [isScoreEventsLoading, setIsScoreEventsLoading] = useState(false);
  const [isScoreHistoryVisible, setIsScoreHistoryVisible] = useState(false);
  const [resourceView, setResourceView] = useState("teachers");
  const [requestView, setRequestView] = useState("leave");
  const [attendanceView, setAttendanceView] = useState("current");
  const [leaveRequestView, setLeaveRequestView] = useState("active");

  useEffect(() => {
    if (!selectedLeaveRequest) {
      return;
    }

    const nextSelected = leaveRequests.find((item) => item.request_id === selectedLeaveRequest.request_id) || null;
    setSelectedLeaveRequest(nextSelected);
  }, [leaveRequests, selectedLeaveRequest]);

  const classesByCenter = classes.reduce((groups, item) => {
    const key = item.center_label || "Unknown Center";
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
    return groups;
  }, {});
  const teachersById = new Map(teachers.map((item) => [item.teacher_id, item]));
  const activeLeaveRequestCount = leaveRequests.filter((item) => ACTIVE_LEAVE_STATUSES.has(item.status)).length;
  const visibleLeaveRequests = filterLeaveRequestsByView(leaveRequests, leaveRequestView);
  const visibleAttendanceRecords = filterAdminAttendanceByView(attendanceRecords, attendanceView);
  const scoresByTeacherId = new Map(teacherScores.map((item) => [item.teacher_id, item]));

  const profileEditMeta = {
    elo: {
      label: "ELO",
      inputProps: { type: "number", min: "0", required: true },
      normalize: (value) => Number(value),
    },
    education_score: {
      label: "Education",
      inputProps: { type: "number", min: "0", max: "10", step: "0.1", placeholder: "0 - 10" },
      normalize: (value) => (value === "" ? null : Number(value)),
    },
    max_slots_per_day: {
      label: "Max Slots / Day",
      inputProps: { type: "number", min: "1", required: true },
      normalize: (value) => Number(value),
    },
  };

  function openProfilePanel(teacher, field) {
    setSelectedProfileEdit({ teacher, field });
    setProfileForm({ value: teacher[field] ?? "" });
    setProfilePanelStatus({ kind: "", message: "" });
  }

  async function openScorePanel(teacher) {
    setSelectedScoreTeacher(teacher);
    setScoreForm({ delta: "", reason: "", evidence_text: "", evidence_url: "" });
    setScorePanelStatus({ kind: "", message: "" });
    setScoreEvents([]);
    setIsScoreHistoryVisible(false);
  }

  async function loadScoreEvents(teacher) {
    setIsScoreEventsLoading(true);

    try {
      const data = await fetch(`${apiBase}/teachers/${teacher.teacher_id}/score-events`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }).then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.detail || "Failed to load score events");
        }
        return payload;
      });
      setScoreEvents(data);
    } catch (error) {
      setScoreEvents([]);
      setScorePanelStatus({ kind: "error", message: error.message });
    } finally {
      setIsScoreEventsLoading(false);
    }
  }

  async function handleProfileSubmit(event) {
    event.preventDefault();
    if (!selectedProfileEdit) {
      return;
    }

    const { teacher, field } = selectedProfileEdit;
    const meta = profileEditMeta[field];
    const payload = {
      [field]: meta.normalize(profileForm.value),
    };

    const success = await onUpdateTeacherProfile(teacher.teacher_id, payload);
    if (!success) {
      return;
    }

    setProfilePanelStatus({ kind: "success", message: `${meta.label} updated.` });
    setSelectedProfileEdit((current) => (current ? { ...current, teacher: { ...current.teacher, ...payload } } : current));
  }

  async function handleDeleteTeacherAvatar() {
    if (!selectedAvatarTeacher?.profile_image_url) {
      return;
    }

    if (!confirm(`Delete profile image for ${selectedAvatarTeacher.teacher_id} - ${selectedAvatarTeacher.name}?`)) {
      return;
    }

    const success = await onDeleteTeacherProfileImage(selectedAvatarTeacher.teacher_id);
    if (success) {
      setSelectedAvatarTeacher((current) =>
        current
          ? {
              ...current,
              profile_image_url: null,
            }
          : current,
      );
    }
  }

  async function toggleScoreHistory() {
    if (isScoreHistoryVisible) {
      setIsScoreHistoryVisible(false);
      return;
    }

    setIsScoreHistoryVisible(true);
    if (selectedScoreTeacher) {
      await loadScoreEvents(selectedScoreTeacher);
    }
  }

  async function handleScoreSubmit(event) {
    event.preventDefault();
    if (!selectedScoreTeacher) {
      return;
    }

    const success = await onCreateTeacherScoreEvent(selectedScoreTeacher.teacher_id, {
      score_month: new Date().toISOString().slice(0, 10),
      delta: Number(scoreForm.delta),
      reason: scoreForm.reason,
      evidence_text: scoreForm.evidence_text,
      evidence_url: scoreForm.evidence_url || null,
    });

    if (!success) {
      return;
    }

    setScoreForm({ delta: "", reason: "", evidence_text: "", evidence_url: "" });
    setScorePanelStatus({ kind: "success", message: "Score event created." });
    if (isScoreHistoryVisible) {
      await loadScoreEvents(selectedScoreTeacher);
    }
  }

  return (
    <>
      <section className="monitor-grid monitor-grid-summary">
        <article className="info-card">
          <p className="eyebrow">Teachers</p>
          <h2>{teachers.length}</h2>
          <p className="subtle">All available teacher records.</p>
        </article>

        <article className="info-card">
          <p className="eyebrow">Classes</p>
          <h2>{classes.length}</h2>
          <p className="subtle">All classes currently in the system.</p>
        </article>

        <article className="info-card">
          <p className="eyebrow">Leave Requests</p>
          <h2>{activeLeaveRequestCount}</h2>
          <p className="subtle">Active leave request records.</p>
        </article>

        <article className="info-card">
          <p className="eyebrow">Attendance</p>
          <h2>{attendanceRecords.length}</h2>
          <p className="subtle">Recorded check-ins from users.</p>
        </article>

        {role === "developer" ? (
          <article className="info-card">
            <p className="eyebrow">Managers</p>
            <h2>{managerUsers.length}</h2>
            <p className="subtle">Manager accounts visible to developer.</p>
          </article>
        ) : null}
      </section>

      {role === "developer" ? (
        <BackupManagement apiBase={apiBase} token={token} />
      ) : null}

      <section className="dashboard-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Attendance</p>
            <h2>Check-in records</h2>
          </div>
          <div className="section-toggle-group" role="tablist" aria-label="Attendance filter">
            <button
              type="button"
              className={`section-toggle-button ${attendanceView === "current" ? "active" : ""}`.trim()}
              onClick={() => setAttendanceView("current")}
            >
              Current
            </button>
            <button
              type="button"
              className={`section-toggle-button ${attendanceView === "history" ? "active" : ""}`.trim()}
              onClick={() => setAttendanceView("history")}
            >
              History
            </button>
            <button
              type="button"
              className={`section-toggle-button ${attendanceView === "all" ? "active" : ""}`.trim()}
              onClick={() => setAttendanceView("all")}
            >
              All
            </button>
          </div>
        </div>

        <DataTable
          title="Attendance Records"
          columns={[
            { key: "display_name", label: "User" },
            { key: "user_code", label: "User Code" },
            { key: "teacher_id", label: "Teacher ID" },
            { key: "checked_at", label: "Time", render: (row) => formatDateTimeValue(row.checked_at) },
            {
              key: "nearest_center_name",
              label: "Location",
              render: (row) => (row.status === "VALID" ? row.nearest_center_name || "Nearest center" : "INVALID"),
            },
            {
              key: "status",
              label: "Status",
              render: (row) => <StatusPill value={row.status || "INVALID"} />,
            },
            {
              key: "accuracy_meters",
              label: "Accuracy",
              render: (row) =>
                row.accuracy_meters === null || row.accuracy_meters === undefined
                  ? "-"
                  : `${Math.round(Number(row.accuracy_meters))} m`,
            },
          ]}
          rows={visibleAttendanceRecords}
          emptyMessage="No attendance records found."
          embedded
          pageSize={10}
        />
      </section>

      <section className="dashboard-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Resources</p>
            <h2>{resourceView === "teachers" ? "Teachers" : "Classes by center"}</h2>
          </div>
          <div className="section-toggle-group" role="tablist" aria-label="Resource view">
            <button
              type="button"
              className={`section-toggle-button ${resourceView === "teachers" ? "active" : ""}`.trim()}
              onClick={() => setResourceView("teachers")}
            >
              Teachers
            </button>
            <button
              type="button"
              className={`section-toggle-button ${resourceView === "classes" ? "active" : ""}`.trim()}
              onClick={() => setResourceView("classes")}
            >
              Classes
            </button>
          </div>
        </div>

        {resourceView === "teachers" ? (
          <DataTable
            title="Teachers"
            columns={[
              {
                key: "avatar",
                label: "Avatar",
                render: (row) => (
                  <button
                    type="button"
                    className="avatar-preview-button"
                    onClick={() => setSelectedAvatarTeacher(row)}
                    aria-label={`View avatar for ${row.name}`}
                  >
                    <UserAvatar
                      apiBase={apiBase}
                      imageUrl={row.profile_image_url}
                      name={row.name}
                      fallbackCode={row.teacher_id}
                      size="small"
                    />
                  </button>
                ),
              },
              { key: "teacher_id", label: "Teacher ID" },
              { key: "name", label: "Name" },
              { key: "contact", label: "Phone" },
              { key: "email", label: "Email" },
              {
                key: "elo",
                label: <span className="table-value-center">ELO</span>,
                render: (row) => (
                  <span className="table-value-center">
                    <button type="button" className="score-button" onClick={() => openProfilePanel(row, "elo")}>
                      {formatValue(row.elo)}
                    </button>
                  </span>
                ),
              },
              {
                key: "education_score",
                label: <span className="table-value-center">Education</span>,
                render: (row) => (
                  <span className="table-value-center">
                    <button type="button" className="score-button" onClick={() => openProfilePanel(row, "education_score")}>
                      {formatValue(row.education_score)}
                    </button>
                  </span>
                ),
              },
              {
                key: "max_slots_per_day",
                label: <span className="table-value-center">Max Slots</span>,
                render: (row) => (
                  <span className="table-value-center">
                    <button type="button" className="score-button" onClick={() => openProfilePanel(row, "max_slots_per_day")}>
                      {formatValue(row.max_slots_per_day)}
                    </button>
                  </span>
                ),
              },
              {
                key: "monthly_score",
                label: "Monthly Score",
                render: (row) => {
                  const score = scoresByTeacherId.get(row.teacher_id) || { score: 100, max_score: 110 };
                  return (
                    <button type="button" className="score-button" onClick={() => openScorePanel(row)}>
                      {score.score}/{score.max_score}
                    </button>
                  );
                },
              },
              {
                key: "active",
                label: "Active",
                render: (row) => (
                  <select
                    className={`table-select ${row.active ? "table-select-active" : "table-select-inactive"}`}
                    value={row.active ? "yes" : "no"}
                    disabled={pendingAction === `teacher-active-${row.teacher_id}`}
                    onChange={(event) => onUpdateTeacherActive(row.teacher_id, event.target.value === "yes")}
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                ),
              },
            ]}
            rows={teachers}
            emptyMessage="No teachers found."
            embedded
            pageSize={10}
          />
        ) : classes.length === 0 ? (
          <p className="subtle">No classes found.</p>
        ) : (
          <div className="center-class-groups">
            {Object.entries(classesByCenter).map(([centerLabel, centerClasses]) => (
              <div key={centerLabel} className="center-class-group">
                <div className="center-class-head">
                  <h3>{centerLabel}</h3>
                  <span className="subtle">{centerClasses.length} classes</span>
                </div>
                <DataTable
                  title={`${centerLabel} Classes`}
                  columns={[
                    { key: "class_id", label: "Class ID" },
                    { key: "day_of_week", label: "Day" },
                    {
                      key: "time",
                      label: "Time",
                      render: (row) => `${formatTimeValue(row.start_time)} - ${formatTimeValue(row.end_time)}`,
                    },
                    { key: "room_no", label: "Room" },
                    { key: "teacher_label", label: "Teacher" },
                    { key: "status", label: "Status", render: (row) => <StatusPill value={row.status} /> },
                  ]}
                  rows={centerClasses}
                  emptyMessage="No classes found."
                  embedded
                  pageSize={5}
                  tableClassName="classes-center-table"
                  colClasses={[
                    "classes-col-id",
                    "classes-col-day",
                    "classes-col-time",
                    "classes-col-room",
                    "classes-col-teacher",
                    "classes-col-status",
                  ]}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Assignment</p>
            <h2>Assignment Queue</h2>
          </div>
        </div>

        {replacementQueue.length === 0 ? (
          <p className="subtle">No open or replacement classes are waiting for assignment.</p>
        ) : (
          <div className="replacement-queue">
            {replacementQueue.map((item) => {
              const suggestions = replacementSuggestions[item.class_id] ?? [];

              return (
                <article key={item.class_id} className="replacement-card">
                  <div className="replacement-card-head">
                    <div>
                      <h3>{item.class_id}</h3>
                      <p className="subtle">
                        {item.day_of_week} | {item.center_label} | {formatTimeValue(item.start_time)} - {formatTimeValue(item.end_time)}
                      </p>
                      <p className="subtle">
                        Room {formatValue(item.room_no)} | Current teacher {formatValue(item.teacher_id)} | Status {formatValue(item.status)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="table-action-button"
                      disabled={pendingAction === `suggest-${item.class_id}`}
                      onClick={() => onLoadReplacementSuggestions(item.class_id)}
                    >
                      {pendingAction === `suggest-${item.class_id}` ? "Loading..." : "Load suggestions"}
                    </button>
                  </div>

                  {suggestions.length > 0 ? (
                    <div className="replacement-suggestions">
                      {suggestions.map((suggestion) => (
                        <div key={`${item.class_id}-${suggestion.teacher_id}`} className="replacement-suggestion-row">
                          <div className="replacement-suggestion-meta">
                            <button
                              type="button"
                              className="suggestion-teacher-button"
                              onClick={() =>
                                setSelectedSuggestionTeacher(
                                  teachersById.get(suggestion.teacher_id) || {
                                    teacher_id: suggestion.teacher_id,
                                    name: suggestion.name,
                                    contact: "",
                                    email: "",
                                    elo: suggestion.elo,
                                    education_score: suggestion.education_score,
                                  },
                                )
                              }
                            >
                              {suggestion.teacher_id} - {suggestion.name}
                            </button>
                            <span className="subtle">
                              Final {suggestion.final_score.toFixed(4)} | ELO {suggestion.normalized_score.toFixed(4)} | Education {suggestion.normalized_education_score.toFixed(4)}
                            </span>
                            <span className="subtle">
                              Center match {suggestion.center_match ? "Yes" : "No"} | Time match {suggestion.time_match ? "Yes" : "No"}
                            </span>
                            <span className="subtle">
                              Slots {suggestion.assigned_slots_that_day}/{suggestion.max_slots_per_day}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="table-action-button"
                            disabled={pendingAction === `assign-${item.class_id}-${suggestion.teacher_id}`}
                            onClick={() => onAssignReplacement(item.class_id, suggestion.teacher_id)}
                          >
                            {pendingAction === `assign-${item.class_id}-${suggestion.teacher_id}` ? "Assigning..." : "Assign"}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="subtle replacement-empty">Load suggestions to see eligible teachers for assignment.</p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="dashboard-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Requests</p>
            <h2>{requestView === "leave" ? "Leave Requests" : "Password Reset Requests"}</h2>
          </div>
          <div className="section-toggle-group" role="tablist" aria-label="Request view">
            <button
              type="button"
              className={`section-toggle-button ${requestView === "leave" ? "active" : ""}`.trim()}
              onClick={() => setRequestView("leave")}
            >
              Leave
            </button>
            <button
              type="button"
              className={`section-toggle-button ${requestView === "password" ? "active" : ""}`.trim()}
              onClick={() => setRequestView("password")}
            >
              Password Change
            </button>
          </div>
        </div>

        {requestView === "leave" ? (
          <>
            <div className="table-filter-row">
              <div className="section-toggle-group" role="tablist" aria-label="Leave request filter">
                <button
                  type="button"
                  className={`section-toggle-button ${leaveRequestView === "active" ? "active" : ""}`.trim()}
                  onClick={() => setLeaveRequestView("active")}
                >
                  Active
                </button>
                <button
                  type="button"
                  className={`section-toggle-button ${leaveRequestView === "history" ? "active" : ""}`.trim()}
                  onClick={() => setLeaveRequestView("history")}
                >
                  History
                </button>
                <button
                  type="button"
                  className={`section-toggle-button ${leaveRequestView === "all" ? "active" : ""}`.trim()}
                  onClick={() => setLeaveRequestView("all")}
                >
                  All
                </button>
              </div>
            </div>
          <DataTable
            title="Leave Requests"
            columns={[
              { key: "request_id", label: "Request ID" },
              { key: "class_id", label: "Class ID" },
              { key: "center_id", label: "Center" },
              { key: "teacher_name", label: "Teacher" },
              { key: "assigned_manager_name", label: "Assigned Manager" },
              { key: "class_day_of_week", label: "Class Day" },
              { key: "request_date", label: "Request Date" },
              { key: "status", label: "Status", render: (row) => <StatusPill value={row.status} /> },
              {
                key: "info",
                label: "Info",
                render: (row) => (
                  <button
                    type="button"
                    className="table-action-button table-action-button-muted"
                    onClick={() => setSelectedLeaveRequest(row)}
                  >
                    Show
                  </button>
                ),
              },
            ]}
            rows={visibleLeaveRequests}
            emptyMessage="No leave requests found."
            embedded
          />
          </>
        ) : (
          <DataTable
            title="Password Reset Requests"
            columns={[
              { key: "user_code", label: "User Code" },
              {
                key: "display_name",
                label: "Display Name",
                render: (row) => (
                  <div className="user-inline-cell">
                    <UserAvatar
                      apiBase={apiBase}
                      imageUrl={row.profile_image_url}
                      name={row.display_name}
                      fallbackCode={row.user_code}
                      size="small"
                    />
                    <span>{formatValue(row.display_name)}</span>
                  </div>
                ),
              },
              { key: "created_at", label: "Created" },
              { key: "status", label: "Status", render: (row) => <StatusPill value={row.status} /> },
              { key: "request_note", label: "Note", render: (row) => formatValue(row.request_note) },
              {
                key: "actions",
                label: "Actions",
                render: (row) => (
                  <div className="table-actions">
                    {row.status === "REQUESTED" ? (
                      <>
                        <button
                          type="button"
                          className="table-action-button"
                          disabled={pendingAction === `reset-request-${row.request_id}`}
                          onClick={() => onResetPasswordRequest(row.request_id)}
                        >
                          Reset to default
                        </button>
                      </>
                    ) : (
                      <span className="subtle">Processed</span>
                    )}
                  </div>
                ),
              },
            ]}
            rows={resetRequests}
            emptyMessage="No password reset requests found."
            embedded
          />
        )}
      </section>

      {selectedLeaveRequest ? (
        <FloatingPanel
          eyebrow="Leave Request"
          title={selectedLeaveRequest.request_id}
          titleId="leave-request-info-title"
          onClose={() => setSelectedLeaveRequest(null)}
        >
                <div className="floating-panel-grid">
                  <div>
                    <p className="subtle">Teacher</p>
                    <strong>{formatValue(selectedLeaveRequest.teacher_name)}</strong>
                  </div>
                  <div>
                    <p className="subtle">Class</p>
                    <strong>{formatValue(selectedLeaveRequest.class_id)}</strong>
                  </div>
                  <div>
                    <p className="subtle">Center</p>
                    <strong>{formatValue(selectedLeaveRequest.center_id)}</strong>
                  </div>
                  <div>
                    <p className="subtle">Class Day</p>
                    <strong>{formatValue(selectedLeaveRequest.class_day_of_week)}</strong>
                  </div>
                  <div>
                    <p className="subtle">Request Date</p>
                    <strong>{formatValue(selectedLeaveRequest.request_date)}</strong>
                  </div>
                </div>

                <div className="floating-panel-section">
                  <p className="subtle">Reason</p>
                  <div className="floating-panel-reason-box">
                    <p>{formatValue(selectedLeaveRequest.reason)}</p>
                  </div>
                </div>

                <div className="floating-panel-section floating-panel-status-row">
                  <p className="subtle">Status</p>
                  <StatusPill value={selectedLeaveRequest.status} />
                </div>

                <div className="floating-panel-actions">
                  {selectedLeaveRequest.status === "REQUESTED" ? (
                    <button
                      type="button"
                      className="table-action-button"
                      disabled={pendingAction === `approve-${selectedLeaveRequest.request_id}`}
                      onClick={() => onApproveLeaveRequest(selectedLeaveRequest.request_id)}
                    >
                      {pendingAction === `approve-${selectedLeaveRequest.request_id}` ? "Approving..." : "Approve"}
                    </button>
                  ) : null}
                  {selectedLeaveRequest.status === "REQUESTED" ? (
                    <button
                      type="button"
                      className="table-action-button table-action-button-muted"
                      disabled={pendingAction === `reject-${selectedLeaveRequest.request_id}`}
                      onClick={() => onRejectLeaveRequest(selectedLeaveRequest.request_id)}
                    >
                      {pendingAction === `reject-${selectedLeaveRequest.request_id}` ? "Rejecting..." : "Reject"}
                    </button>
                  ) : null}
                </div>
        </FloatingPanel>
      ) : null}

      {selectedSuggestionTeacher ? (
        <FloatingPanel
          eyebrow="Teacher Contact"
          title={`${selectedSuggestionTeacher.teacher_id} - ${selectedSuggestionTeacher.name}`}
          titleId="suggestion-teacher-title"
          onClose={() => setSelectedSuggestionTeacher(null)}
        >
                <div className="floating-panel-grid">
                  <div>
                    <p className="subtle">Phone</p>
                    <strong>{formatValue(selectedSuggestionTeacher.contact)}</strong>
                  </div>
                  <div>
                    <p className="subtle">Personal Email</p>
                    <strong>{formatValue(selectedSuggestionTeacher.email)}</strong>
                  </div>
                  <div>
                    <p className="subtle">ELO</p>
                    <strong>{formatValue(selectedSuggestionTeacher.elo)}</strong>
                  </div>
                  <div>
                    <p className="subtle">Education Score</p>
                    <strong>{formatValue(selectedSuggestionTeacher.education_score)}</strong>
                  </div>
                </div>
        </FloatingPanel>
      ) : null}

      {selectedAvatarTeacher ? (
        <FloatingPanel
          eyebrow="Teacher Avatar"
          title={`${selectedAvatarTeacher.teacher_id} - ${selectedAvatarTeacher.name}`}
          titleId="teacher-avatar-title"
          onClose={() => setSelectedAvatarTeacher(null)}
        >
          <div className="teacher-avatar-verification-panel">
            <div className="teacher-avatar-verification-frame">
              <UserAvatar
                apiBase={apiBase}
                imageUrl={selectedAvatarTeacher.profile_image_url}
                name={selectedAvatarTeacher.name}
                fallbackCode={selectedAvatarTeacher.teacher_id}
                size="large"
                className="teacher-avatar-verification-image"
              />
              {selectedAvatarTeacher.profile_image_url ? (
                <button
                  type="button"
                  className="teacher-avatar-delete-button"
                  disabled={pendingAction === `teacher-avatar-delete-${selectedAvatarTeacher.teacher_id}`}
                  onClick={handleDeleteTeacherAvatar}
                >
                  {pendingAction === `teacher-avatar-delete-${selectedAvatarTeacher.teacher_id}` ? "Deleting..." : "Delete"}
                </button>
              ) : null}
            </div>
            <div className="teacher-avatar-verification-copy">
              <p className="subtle">Teacher ID</p>
              <strong>{formatValue(selectedAvatarTeacher.teacher_id)}</strong>
              <p className="subtle">Name</p>
              <strong>{formatValue(selectedAvatarTeacher.name)}</strong>
            </div>
          </div>
        </FloatingPanel>
      ) : null}

      {selectedProfileEdit ? (
        <FloatingPanel
          eyebrow="Teacher Profile"
          title={`${profileEditMeta[selectedProfileEdit.field].label} | ${selectedProfileEdit.teacher.teacher_id} - ${selectedProfileEdit.teacher.name}`}
          titleId="teacher-profile-edit-title"
          onClose={() => setSelectedProfileEdit(null)}
        >
          <div className="floating-panel-grid score-summary-grid">
            <div>
              <p className="subtle">Current {profileEditMeta[selectedProfileEdit.field].label}</p>
              <strong>{formatValue(selectedProfileEdit.teacher[selectedProfileEdit.field])}</strong>
            </div>
          </div>

          <form className="auth-form compact score-panel-form" onSubmit={handleProfileSubmit}>
            <label className="field">
              <span>{profileEditMeta[selectedProfileEdit.field].label}</span>
              <input
                value={profileForm.value}
                onChange={(event) => setProfileForm({ value: event.target.value })}
                {...profileEditMeta[selectedProfileEdit.field].inputProps}
              />
            </label>
            <button className="table-action-button" type="submit" disabled={pendingAction === `teacher-profile-${selectedProfileEdit.teacher.teacher_id}`}>
              {pendingAction === `teacher-profile-${selectedProfileEdit.teacher.teacher_id}` ? "Saving..." : "Save"}
            </button>
          </form>

          <div className={`status score-panel-status ${profilePanelStatus.kind}`.trim()}>{profilePanelStatus.message}</div>
        </FloatingPanel>
      ) : null}

      {selectedScoreTeacher ? (
        <FloatingPanel
          eyebrow="Teacher Score"
          title={`${selectedScoreTeacher.teacher_id} - ${selectedScoreTeacher.name}`}
          titleId="teacher-score-title"
          onClose={() => setSelectedScoreTeacher(null)}
        >
          {(() => {
            const score = scoresByTeacherId.get(selectedScoreTeacher.teacher_id) || {
              score: 100,
              max_score: 110,
              event_count: 0,
            };

            return (
              <>
                <div className="floating-panel-grid score-summary-grid">
                  <div>
                    <p className="subtle">Monthly Score</p>
                    <strong>{score.score}/{score.max_score}</strong>
                  </div>
                  <div>
                    <p className="subtle">Events</p>
                    <strong>{score.event_count}</strong>
                  </div>
                </div>

                <form className="auth-form compact score-panel-form" onSubmit={handleScoreSubmit}>
                  <label className="field">
                    <span>Delta</span>
                    <input
                      value={scoreForm.delta}
                      onChange={(event) => setScoreForm((current) => ({ ...current, delta: event.target.value }))}
                      type="number"
                      placeholder="-5 or 3"
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Reason</span>
                    <input
                      value={scoreForm.reason}
                      onChange={(event) => setScoreForm((current) => ({ ...current, reason: event.target.value }))}
                      type="text"
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Evidence Text</span>
                    <textarea
                      value={scoreForm.evidence_text}
                      onChange={(event) => setScoreForm((current) => ({ ...current, evidence_text: event.target.value }))}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Evidence URL</span>
                    <input
                      value={scoreForm.evidence_url}
                      onChange={(event) => setScoreForm((current) => ({ ...current, evidence_url: event.target.value }))}
                      type="url"
                    />
                  </label>
                  <button className="table-action-button" type="submit" disabled={pendingAction === `score-${selectedScoreTeacher.teacher_id}`}>
                    {pendingAction === `score-${selectedScoreTeacher.teacher_id}` ? "Saving..." : "Save score event"}
                  </button>
                </form>

                <div className={`status score-panel-status ${scorePanelStatus.kind}`.trim()}>{scorePanelStatus.message}</div>

                <div className="floating-panel-section score-history-section">
                  <button type="button" className="score-history-toggle" onClick={toggleScoreHistory}>
                    {isScoreHistoryVisible ? "Hide Score History" : "Show Score History"}
                  </button>
                  {isScoreHistoryVisible ? (
                    isScoreEventsLoading ? (
                      <p className="subtle">Loading score events...</p>
                    ) : scoreEvents.length === 0 ? (
                      <p className="subtle">No score events this month.</p>
                    ) : (
                      <div className="score-event-list">
                        {scoreEvents.map((item) => (
                          <article className="score-event-item" key={item.event_id}>
                            <strong>{item.delta > 0 ? "+" : ""}{item.delta} points</strong>
                            <span>{formatDateTimeValue(item.created_at)}</span>
                            <p>{item.reason}</p>
                            <p className="subtle">{item.evidence_text}</p>
                            {item.evidence_url ? (
                              <a className="inline-link" href={item.evidence_url} target="_blank" rel="noreferrer">
                                View evidence
                              </a>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    )
                  ) : null}
                </div>
              </>
            );
          })()}
        </FloatingPanel>
      ) : null}

      <div className={`status ${actionStatus.kind}`.trim()} aria-live="polite">
        {actionStatus.message}
      </div>

      {role === "developer" ? (
        <DataTable
          title="Managers"
          columns={[
            { key: "user_code", label: "User Code" },
            {
              key: "display_name",
              label: "Display Name",
              render: (row) => (
                <div className="user-inline-cell">
                  <UserAvatar
                    apiBase={apiBase}
                    imageUrl={row.profile_image_url}
                    name={row.display_name}
                    fallbackCode={row.user_code}
                    size="small"
                  />
                  <span>{formatValue(row.display_name)}</span>
                </div>
              ),
            },
            { key: "role", label: "Role" },
            { key: "teacher_id", label: "Teacher ID" },
          ]}
          rows={managerUsers}
          emptyMessage="No manager accounts found."
        />
      ) : null}
    </>
  );
}

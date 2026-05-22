import { useEffect, useState } from "react";

import UserAvatar from "../../components/UserAvatar.jsx";
import DataTable from "./DataTable.jsx";
import FloatingPanel from "./FloatingPanel.jsx";
import StatusPill from "./StatusPill.jsx";
import { formatDateTimeValue, formatTimeValue, formatValue } from "./monitorUtils.js";

export default function AdminMonitorView({
  actionStatus,
  attendanceRecords,
  apiBase,
  leaveRequests,
  managerUsers,
  pendingAction,
  replacementQueue,
  replacementSuggestions,
  resetRequests,
  role,
  teachers,
  classes,
  onApproveLeaveRequest,
  onAssignReplacement,
  onRejectLeaveRequest,
  onLoadReplacementSuggestions,
  onResetPasswordRequest,
  onUpdateTeacherActive,
}) {
  const [selectedLeaveRequest, setSelectedLeaveRequest] = useState(null);
  const [selectedSuggestionTeacher, setSelectedSuggestionTeacher] = useState(null);
  const [resourceView, setResourceView] = useState("teachers");
  const [requestView, setRequestView] = useState("leave");

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
          <h2>{leaveRequests.length}</h2>
          <p className="subtle">All leave request records.</p>
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

      <section className="dashboard-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Attendance</p>
            <h2>Check-in records</h2>
          </div>
        </div>

        <DataTable
          title="Attendance Records"
          columns={[
            { key: "display_name", label: "User" },
            { key: "user_code", label: "User Code" },
            { key: "teacher_id", label: "Teacher ID" },
            { key: "checked_at", label: "Time", render: (row) => formatDateTimeValue(row.checked_at) },
            { key: "latitude", label: "Latitude" },
            { key: "longitude", label: "Longitude" },
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
          rows={attendanceRecords}
          emptyMessage="No attendance records found."
          embedded
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
              { key: "teacher_id", label: "Teacher ID" },
              { key: "name", label: "Name" },
              { key: "contact", label: "Phone" },
              { key: "email", label: "Email" },
              {
                key: "elo",
                label: <span className="table-value-center">ELO</span>,
                render: (row) => <span className="table-value-center">{formatValue(row.elo)}</span>,
              },
              {
                key: "education_score",
                label: <span className="table-value-center">Education</span>,
                render: (row) => <span className="table-value-center">{formatValue(row.education_score)}</span>,
              },
              {
                key: "max_slots_per_day",
                label: <span className="table-value-center">Max Slots</span>,
                render: (row) => <span className="table-value-center">{formatValue(row.max_slots_per_day)}</span>,
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
                    { key: "class_date", label: "Date" },
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
                  tableClassName="classes-center-table"
                  colClasses={[
                    "classes-col-id",
                    "classes-col-date",
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
                        {item.class_date} | {item.center_label} | {formatTimeValue(item.start_time)} - {formatTimeValue(item.end_time)}
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
          <DataTable
            title="Leave Requests"
            columns={[
              { key: "request_id", label: "Request ID" },
              { key: "class_id", label: "Class ID" },
              { key: "center_id", label: "Center" },
              { key: "teacher_name", label: "Teacher" },
              { key: "request_date", label: "Date" },
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
            rows={leaveRequests}
            emptyMessage="No leave requests found."
            embedded
          />
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

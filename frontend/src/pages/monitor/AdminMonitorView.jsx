import DataTable from "./DataTable.jsx";
import StatusPill from "./StatusPill.jsx";
import { formatTimeValue, formatValue } from "./monitorUtils.js";

export default function AdminMonitorView({
  actionStatus,
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
  onCancelLeaveRequest,
  onLoadReplacementSuggestions,
  onResetPasswordRequest,
}) {
  const classesByCenter = classes.reduce((groups, item) => {
    const key = item.center_label || "Unknown Center";
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
    return groups;
  }, {});

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

        {role === "developer" ? (
          <article className="info-card">
            <p className="eyebrow">Managers</p>
            <h2>{managerUsers.length}</h2>
            <p className="subtle">Manager accounts visible to developer.</p>
          </article>
        ) : null}
      </section>

      <DataTable
        title="Teachers"
        columns={[
          { key: "teacher_id", label: "Teacher ID" },
          { key: "name", label: "Name" },
          { key: "contact", label: "Contact" },
          { key: "score", label: "Score" },
          { key: "max_slots_per_day", label: "Max Slots" },
          { key: "active", label: "Active", render: (row) => (row.active ? "Yes" : "No") },
        ]}
        rows={teachers}
        emptyMessage="No teachers found."
      />

      <section className="dashboard-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Classes</p>
            <h2>Classes by center</h2>
          </div>
        </div>

        {classes.length === 0 ? (
          <p className="subtle">No classes found.</p>
        ) : (
          <div className="center-class-groups">
            {Object.entries(classesByCenter).map(([centerLabel, centerClasses]) => (
              <div key={centerLabel} className="center-class-group">
                <div className="center-class-head">
                  <h3>{centerLabel}</h3>
                  <span className="subtle">{centerClasses.length} classes</span>
                </div>

                <div className="table-wrap">
                  <table className="data-table classes-center-table">
                    <colgroup>
                      <col className="classes-col-id" />
                      <col className="classes-col-date" />
                      <col className="classes-col-time" />
                      <col className="classes-col-room" />
                      <col className="classes-col-teacher" />
                      <col className="classes-col-status" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Class ID</th>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Room</th>
                        <th>Teacher</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {centerClasses.map((row) => (
                        <tr key={row.class_id}>
                          <td>{row.class_id}</td>
                          <td>{row.class_date}</td>
                          <td>{formatTimeValue(row.start_time)} - {formatTimeValue(row.end_time)}</td>
                          <td>{formatValue(row.room_no)}</td>
                          <td>{formatValue(row.teacher_label)}</td>
                          <td>
                            <StatusPill value={row.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Replacement</p>
            <h2>Replacement Queue</h2>
          </div>
        </div>

        {replacementQueue.length === 0 ? (
          <p className="subtle">No classes currently need replacement.</p>
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
                        Room {formatValue(item.room_no)} | Current teacher {formatValue(item.teacher_id)}
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
                            <strong>
                              {suggestion.teacher_id} - {suggestion.name}
                            </strong>
                            <span className="subtle">
                              Final {suggestion.final_score.toFixed(4)} | Base {suggestion.normalized_score.toFixed(4)}
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
                    <p className="subtle replacement-empty">Load suggestions to see eligible replacement teachers.</p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <DataTable
        title="Leave Requests"
        columns={[
          { key: "request_id", label: "Request ID" },
          { key: "class_id", label: "Class ID" },
          { key: "center_id", label: "Center" },
          { key: "teacher_id", label: "Teacher ID" },
          { key: "request_date", label: "Date" },
          { key: "reason", label: "Reason" },
          { key: "status", label: "Status", render: (row) => <StatusPill value={row.status} /> },
          {
            key: "actions",
            label: "Actions",
            render: (row) => (
              <div className="table-actions">
                {row.status === "REQUESTED" ? (
                  <button
                    type="button"
                    className="table-action-button"
                    disabled={pendingAction === `approve-${row.request_id}`}
                    onClick={() => onApproveLeaveRequest(row.request_id)}
                  >
                    Approve
                  </button>
                ) : null}
                {row.status !== "CANCELLED" ? (
                  <button
                    type="button"
                    className="table-action-button table-action-button-muted"
                    disabled={pendingAction === `cancel-${row.request_id}`}
                    onClick={() => onCancelLeaveRequest(row.request_id)}
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            ),
          },
        ]}
        rows={leaveRequests}
        emptyMessage="No leave requests found."
      />

      <DataTable
        title="Password Reset Requests"
        columns={[
          { key: "request_id", label: "Request ID" },
          { key: "user_code", label: "User Code" },
          { key: "display_name", label: "Display Name" },
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
      />

      <div className={`status ${actionStatus.kind}`.trim()} aria-live="polite">
        {actionStatus.message}
      </div>

      {role === "developer" ? (
        <DataTable
          title="Managers"
          columns={[
            { key: "user_code", label: "User Code" },
            { key: "display_name", label: "Display Name" },
            { key: "role", label: "Role" },
            { key: "teacher_id", label: "Teacher ID" },
            { key: "active", label: "Active", render: (row) => (row.active ? "Yes" : "No") },
          ]}
          rows={managerUsers}
          emptyMessage="No manager accounts found."
        />
      ) : null}
    </>
  );
}

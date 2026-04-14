import { useMemo, useState } from "react";
import { createPortal } from "react-dom";

import DataTable from "./DataTable.jsx";
import StatusPill from "./StatusPill.jsx";
import TeacherClassCard from "./TeacherClassCard.jsx";
import { formatTimeValue, formatValue } from "./monitorUtils.js";

export default function TeacherMonitorView({
  highlightedClasses,
  leaveRequests,
  teacherId,
  unassignedCount,
  pendingAction,
  onCreateLeaveRequest,
  onCancelLeaveRequest,
}) {
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [reason, setReason] = useState("");

  const activeLeaveClassIds = useMemo(
    () =>
      new Set(
        leaveRequests
          .filter((item) => item.status === "REQUESTED" || item.status === "APPROVED")
          .map((item) => item.class_id),
      ),
    [leaveRequests],
  );

  const creatableClasses = useMemo(
    () =>
      highlightedClasses.filter(
        (item) => item.status === "ASSIGNED" && !activeLeaveClassIds.has(item.class_id),
      ),
    [activeLeaveClassIds, highlightedClasses],
  );

  const selectedClass =
    creatableClasses.find((item) => item.class_id === selectedClassId) || creatableClasses[0] || null;

  async function handleCreateLeaveRequest(event) {
    event.preventDefault();

    if (!selectedClass) {
      return;
    }

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      return;
    }

    const success = await onCreateLeaveRequest({
      classId: selectedClass.class_id,
      requestDate: selectedClass.class_date,
      reason: trimmedReason,
    });

    if (success) {
      setIsCreatePanelOpen(false);
      setSelectedClassId("");
      setReason("");
    }
  }

  return (
    <>
      <section className="monitor-grid monitor-grid-summary">
        <article className="info-card">
          <p className="eyebrow">Session</p>
          <h2>teacher</h2>
          <p className="subtle">Teacher ID: {teacherId || "-"}</p>
        </article>

        <article className="info-card">
          <p className="eyebrow">Unassigned Count</p>
          <h2>{unassignedCount}</h2>
          <p className="subtle">Classes in your list that are not currently marked as assigned.</p>
        </article>

        <article className="info-card">
          <p className="eyebrow">Leave Requests</p>
          <h2>{leaveRequests.length}</h2>
          <p className="subtle">Your personal leave request records.</p>
        </article>
      </section>

      <section className="dashboard-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Your Classes</p>
            <h2>Current teaching classes</h2>
          </div>
        </div>
        {highlightedClasses.length === 0 ? (
          <p className="subtle">No classes are currently assigned to this teacher account.</p>
        ) : (
          <div className="class-highlight-grid">
            {highlightedClasses.map((item) => (
              <TeacherClassCard key={item.class_id} item={item} />
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">My Leave Requests</p>
            <h2>Personal leave records</h2>
          </div>
          <button
            type="button"
            className="table-action-button"
            disabled={creatableClasses.length === 0}
            onClick={() => {
              setSelectedClassId(creatableClasses[0]?.class_id || "");
              setReason("");
              setIsCreatePanelOpen(true);
            }}
          >
            Create leave request
          </button>
        </div>

        {creatableClasses.length === 0 ? (
          <p className="subtle">
            No eligible assigned classes are available for a new leave request right now.
          </p>
        ) : null}

        <DataTable
          title="My Leave Requests"
          columns={[
            { key: "request_id", label: "Request ID" },
            { key: "class_id", label: "Class ID" },
            { key: "center_id", label: "Center" },
            { key: "request_date", label: "Date" },
            { key: "reason", label: "Reason" },
            {
              key: "status",
              label: "Status",
              render: (row) => <StatusPill value={row.status} />,
            },
            {
              key: "actions",
              label: "Actions",
              render: (row) =>
                row.status === "REQUESTED" ? (
                  <button
                    type="button"
                    className="table-action-button table-action-button-muted"
                    disabled={pendingAction === `cancel-${row.request_id}`}
                    onClick={() => onCancelLeaveRequest(row.request_id)}
                  >
                    {pendingAction === `cancel-${row.request_id}` ? "Cancelling..." : "Cancel"}
                  </button>
                ) : (
                  <span className="subtle">Processed</span>
                ),
            },
          ]}
          rows={leaveRequests}
          emptyMessage="No leave requests found for this teacher."
          embedded
        />
      </section>

      {isCreatePanelOpen
        ? createPortal(
            <div className="floating-panel-backdrop" role="presentation" onClick={() => setIsCreatePanelOpen(false)}>
              <section
                className="floating-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="teacher-leave-request-title"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="floating-panel-head">
                  <div>
                    <p className="eyebrow">Leave Request</p>
                    <h2 id="teacher-leave-request-title">Create a new leave request</h2>
                  </div>
                  <button
                    type="button"
                    className="table-action-button table-action-button-muted"
                    onClick={() => setIsCreatePanelOpen(false)}
                  >
                    Close
                  </button>
                </div>

                <form className="floating-panel-form" onSubmit={handleCreateLeaveRequest}>
                  <label className="field">
                    <span>Class</span>
                    <select
                      value={selectedClass?.class_id || ""}
                      onChange={(event) => setSelectedClassId(event.target.value)}
                      required
                    >
                      {creatableClasses.map((item) => (
                        <option key={item.class_id} value={item.class_id}>
                          {item.class_id} | {item.class_date} | {item.center_label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {selectedClass ? (
                    <div className="floating-panel-summary">
                      <div className="floating-panel-summary-row">
                        <span>Date</span>
                        <strong>{formatValue(selectedClass.class_date)}</strong>
                      </div>
                      <div className="floating-panel-summary-row">
                        <span>Time</span>
                        <strong>
                          {formatTimeValue(selectedClass.start_time)} - {formatTimeValue(selectedClass.end_time)}
                        </strong>
                      </div>
                      <div className="floating-panel-summary-row">
                        <span>Center</span>
                        <strong>{formatValue(selectedClass.center_label)}</strong>
                      </div>
                      <div className="floating-panel-summary-row">
                        <span>Room</span>
                        <strong>{formatValue(selectedClass.room_no)}</strong>
                      </div>
                    </div>
                  ) : null}

                  <label className="field">
                    <span>Reason</span>
                    <textarea
                      rows="4"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="Enter the reason for this leave request."
                      required
                    />
                  </label>

                  <div className="floating-panel-actions">
                    <button
                      type="submit"
                      className="table-action-button"
                      disabled={!selectedClass || !reason.trim() || pendingAction === "create-leave-request"}
                    >
                      {pendingAction === "create-leave-request" ? "Creating..." : "Create request"}
                    </button>
                    <button
                      type="button"
                      className="table-action-button table-action-button-muted"
                      disabled={pendingAction === "create-leave-request"}
                      onClick={() => setIsCreatePanelOpen(false)}
                    >
                      Close
                    </button>
                  </div>
                </form>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

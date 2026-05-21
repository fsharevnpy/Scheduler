import { useMemo, useState } from "react";
import { createPortal } from "react-dom";

import DataTable from "./DataTable.jsx";
import StatusPill from "./StatusPill.jsx";
import TeacherClassCard from "./TeacherClassCard.jsx";
import { formatDateTimeValue, formatTimeValue, formatValue } from "./monitorUtils.js";

export default function TeacherMonitorView({
  highlightedClasses,
  attendanceRecords,
  leaveRequests,
  teacherId,
  unassignedCount,
  pendingAction,
  actionStatus,
  onCheckInAttendance,
  onCreateLeaveRequest,
  onCancelLeaveRequest,
}) {
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [isAttendancePanelOpen, setIsAttendancePanelOpen] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [reason, setReason] = useState("");
  const [attendanceError, setAttendanceError] = useState("");

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

  function handleConfirmAttendance() {
    if (!navigator.geolocation) {
      setAttendanceError("This browser does not support location access.");
      return;
    }

    setAttendanceError("");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const success = await onCheckInAttendance({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });

        if (success) {
          setIsAttendancePanelOpen(false);
        }
      },
      (error) => {
        setAttendanceError(error.message || "Unable to read current location.");
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
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

        <article className="info-card">
          <p className="eyebrow">Attendance</p>
          <h2>{attendanceRecords.length}</h2>
          <p className="subtle">Your recorded check-in entries.</p>
        </article>
      </section>

      <section className="dashboard-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Attendance</p>
            <h2>Check in with current location</h2>
          </div>
          <button
            type="button"
            className="table-action-button"
            disabled={pendingAction === "attendance-check-in"}
            onClick={() => {
              setAttendanceError("");
              setIsAttendancePanelOpen(true);
            }}
          >
            {pendingAction === "attendance-check-in" ? "Recording..." : "Check-in"}
          </button>
        </div>

        {!window.isSecureContext ? (
          <p className="status error">
            Location access may be blocked on mobile over HTTP. Use HTTPS, localhost, or allow location manually if
            your browser supports it.
          </p>
        ) : null}

        <div className={`status ${actionStatus.kind}`.trim()} aria-live="polite">
          {actionStatus.message}
        </div>
        {attendanceError ? <div className="status error">{attendanceError}</div> : null}

        <DataTable
          title="Attendance Records"
          columns={[
            { key: "checked_at", label: "Time", render: (row) => formatDateTimeValue(row.checked_at) },
            { key: "latitude", label: "Latitude" },
            { key: "longitude", label: "Longitude" },
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

      {isAttendancePanelOpen
        ? createPortal(
            <div className="floating-panel-backdrop" role="presentation" onClick={() => setIsAttendancePanelOpen(false)}>
              <section
                className="floating-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="attendance-confirm-title"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="floating-panel-head">
                  <div>
                    <p className="eyebrow">Attendance</p>
                    <h2 id="attendance-confirm-title">Confirm check-in</h2>
                  </div>
                  <button
                    type="button"
                    className="table-action-button table-action-button-muted"
                    onClick={() => setIsAttendancePanelOpen(false)}
                  >
                    Close
                  </button>
                </div>

                <div className="floating-panel-reason-box">
                  <p>
                    This will record the current server time and your phone's location for this account.
                  </p>
                </div>
                {attendanceError ? <div className="status error">{attendanceError}</div> : null}

                <div className="floating-panel-actions">
                  <button
                    type="button"
                    className="table-action-button"
                    disabled={pendingAction === "attendance-check-in"}
                    onClick={handleConfirmAttendance}
                  >
                    {pendingAction === "attendance-check-in" ? "Recording..." : "Confirm check-in"}
                  </button>
                  <button
                    type="button"
                    className="table-action-button table-action-button-muted"
                    disabled={pendingAction === "attendance-check-in"}
                    onClick={() => setIsAttendancePanelOpen(false)}
                  >
                    Cancel
                  </button>
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}

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

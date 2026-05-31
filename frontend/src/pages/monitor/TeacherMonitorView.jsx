import { useMemo, useState } from "react";

import DataTable from "./DataTable.jsx";
import FloatingPanel from "./FloatingPanel.jsx";
import StatusPill from "./StatusPill.jsx";
import TeacherClassCard from "./TeacherClassCard.jsx";
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

function filterTeacherAttendanceByView(attendanceRecords, view) {
  if (view === "current") {
    return attendanceRecords.slice(0, 1);
  }

  if (view === "history") {
    return attendanceRecords.slice(1);
  }

  return attendanceRecords;
}

export default function TeacherMonitorView({
  highlightedClasses,
  attendanceRecords,
  leaveRequests,
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
  const [attendanceView, setAttendanceView] = useState("current");
  const [leaveRequestView, setLeaveRequestView] = useState("active");

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
  const activeLeaveRequestCount = leaveRequests.filter((item) => ACTIVE_LEAVE_STATUSES.has(item.status)).length;
  const visibleLeaveRequests = filterLeaveRequestsByView(leaveRequests, leaveRequestView);
  const visibleAttendanceRecords = filterTeacherAttendanceByView(attendanceRecords, attendanceView);

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
        <article className="info-card teacher-summary-card">
          <div className="teacher-summary-metric">
            <p className="eyebrow">Unassigned</p>
            <h2>{unassignedCount}</h2>
          </div>
          <div className="teacher-summary-metric">
            <p className="eyebrow">Leave Requests</p>
            <h2>{activeLeaveRequestCount}</h2>
          </div>
          <div className="teacher-summary-metric">
            <p className="eyebrow">Attendance</p>
            <h2>{attendanceRecords.length}</h2>
          </div>
        </article>
      </section>

      <section className="dashboard-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Attendance</p>
            <h2>Check in with current location</h2>
          </div>
          <div className="section-head-actions">
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
            {
              key: "nearest_center_name",
              label: "Location",
              render: (row) =>
                row.status === "VALID"
                  ? row.nearest_center_name || "Nearest center"
                  : "Outside valid area",
            },
            {
              key: "status",
              label: "Status",
              render: (row) => <StatusPill value={row.status || "INVALID"} />,
            },
          ]}
          rows={visibleAttendanceRecords}
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
          <div className="section-head-actions">
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
          rows={visibleLeaveRequests}
          emptyMessage="No leave requests found for this teacher."
          embedded
        />
      </section>

      {isAttendancePanelOpen ? (
        <FloatingPanel
          eyebrow="Attendance"
          title="Confirm check-in"
          titleId="attendance-confirm-title"
          onClose={() => setIsAttendancePanelOpen(false)}
        >
          <div className="floating-panel-reason-box">
            <p>This will record the current server time and your phone's location for this account.</p>
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
        </FloatingPanel>
      ) : null}

      {isCreatePanelOpen ? (
        <FloatingPanel
          eyebrow="Leave Request"
          title="Create a new leave request"
          titleId="teacher-leave-request-title"
          onClose={() => setIsCreatePanelOpen(false)}
        >
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
        </FloatingPanel>
      ) : null}
    </>
  );
}

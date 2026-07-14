import { useEffect, useMemo, useState } from "react";

import DataTable from "./DataTable.jsx";
import FloatingPanel from "./FloatingPanel.jsx";
import StatusPill from "./StatusPill.jsx";
import TeacherClassCard from "./TeacherClassCard.jsx";
import { formatClockTimeValue, formatTimeValue, formatValue } from "./monitorUtils.js";

const ACTIVE_LEAVE_STATUSES = new Set(["REQUESTED", "APPROVED"]);
const HISTORY_LEAVE_STATUSES = new Set(["CANCELLED", "REJECTED"]);
const WEEKDAY_BY_INDEX = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

function getDatetimeLocalValue(date = new Date()) {
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localTime.toISOString().slice(0, 16);
}

function getLocalDateKey(date = new Date()) {
  return getDatetimeLocalValue(date).slice(0, 10);
}

function getDayCode(date = new Date()) {
  return WEEKDAY_BY_INDEX[date.getDay()];
}

function getTimeMinutes(value) {
  const [hours, minutes] = String(formatTimeValue(value)).split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 0;
  }

  return hours * 60 + minutes;
}

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

function getFallbackAttendanceStatus(classItem, now) {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const endMinutes = getTimeMinutes(classItem.end_time);

  return currentMinutes > endMinutes ? "MISSED" : "PENDING";
}

function findContiguousClass(highlightedClasses, classItem, direction) {
  return highlightedClasses.find((item) => {
    if (item.class_id === classItem.class_id || item.center_id !== classItem.center_id || item.day_of_week !== classItem.day_of_week) {
      return false;
    }

    return direction === "previous"
      ? formatTimeValue(item.end_time) === formatTimeValue(classItem.start_time)
      : formatTimeValue(item.start_time) === formatTimeValue(classItem.end_time);
  });
}

function getClassBlock(highlightedClasses, classItem) {
  let startClass = classItem;
  let endClass = classItem;
  let previousClass = findContiguousClass(highlightedClasses, startClass, "previous");
  let nextClass = findContiguousClass(highlightedClasses, endClass, "next");

  while (previousClass) {
    startClass = previousClass;
    previousClass = findContiguousClass(highlightedClasses, startClass, "previous");
  }

  while (nextClass) {
    endClass = nextClass;
    nextClass = findContiguousClass(highlightedClasses, endClass, "next");
  }

  return { startClass, endClass };
}

function buildTodayAttendanceRows({ attendanceRecords, highlightedClasses, today }) {
  const todayKey = getLocalDateKey(today);
  const todayDayCode = getDayCode(today);
  const latestCheckInByClass = new Map();
  const latestCheckOutByClass = new Map();

  attendanceRecords.forEach((record) => {
    if (!record.class_id || getLocalDateKey(new Date(record.checked_at)) !== todayKey) {
      return;
    }

    const target = record.event_type === "CHECK_OUT" ? latestCheckOutByClass : latestCheckInByClass;
    const current = target.get(record.class_id);
    if (!current || new Date(record.checked_at) > new Date(current.checked_at)) {
      target.set(record.class_id, record);
    }
  });

  return highlightedClasses
    .filter((classItem) => classItem.day_of_week === todayDayCode)
    .map((classItem) => {
      const { startClass, endClass } = getClassBlock(highlightedClasses, classItem);
      const isBlockStart = classItem.class_id === startClass.class_id;
      const isBlockEnd = classItem.class_id === endClass.class_id;
      const directCheckInRecord = latestCheckInByClass.get(classItem.class_id);
      const directCheckOutRecord = latestCheckOutByClass.get(classItem.class_id);
      const blockStartCheckInRecord = latestCheckInByClass.get(startClass.class_id);
      const blockEndCheckOutRecord = latestCheckOutByClass.get(endClass.class_id);
      const checkInRecord = directCheckInRecord || (!isBlockStart ? blockStartCheckInRecord : null);
      const checkOutRecord = directCheckOutRecord || (!isBlockEnd ? blockEndCheckOutRecord : null);

      return {
        record_id:
          checkInRecord?.record_id ||
          checkOutRecord?.record_id ||
          `attendance-${todayKey}-${classItem.class_id}`,
        checked_at: checkInRecord?.checked_at || null,
        check_out_at: checkOutRecord?.checked_at || null,
        nearest_center_name: checkInRecord?.nearest_center_name || checkOutRecord?.nearest_center_name || classItem.center_label || classItem.center_id,
        status: checkInRecord?.status || "-",
        attendance_status: checkInRecord
          ? isBlockStart
            ? checkInRecord.attendance_status
            : "COVERED"
          : getFallbackAttendanceStatus(classItem, today),
        checkout_status: !isBlockEnd && checkInRecord ? "CONTINUED" : checkOutRecord?.attendance_status || (checkInRecord ? "PENDING" : "-"),
        class_id: classItem.class_id,
        start_time: classItem.start_time,
        end_time: classItem.end_time,
      };
    })
    .sort((left, right) => String(left.start_time).localeCompare(String(right.start_time)));
}

function getScoreBand(score) {
  if (score < 40) {
    return "critical";
  }

  if (score < 60) {
    return "low";
  }

  if (score < 85) {
    return "medium";
  }

  return "high";
}

export default function TeacherMonitorView({
  highlightedClasses,
  attendanceRecords,
  leaveRequestManagers = [],
  leaveRequests,
  unassignedCount,
  pendingAction,
  actionStatus,
  teacherScore,
  onCheckInAttendance,
  onCheckOutAttendance,
  onCreateLeaveRequest,
  onCancelLeaveRequest,
}) {
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [isAttendancePanelOpen, setIsAttendancePanelOpen] = useState(false);
  const [attendancePanelAction, setAttendancePanelAction] = useState("check-in");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedManagerCode, setSelectedManagerCode] = useState("");
  const [reason, setReason] = useState("");
  const [attendanceError, setAttendanceError] = useState("");
  const [attendanceView, setAttendanceView] = useState("current");
  const [leaveRequestView, setLeaveRequestView] = useState("active");
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const timeout = window.setTimeout(() => {
      setCurrentDate(new Date());
    }, Math.max(1000, nextMidnight.getTime() - now.getTime() + 1000));

    return () => window.clearTimeout(timeout);
  }, [currentDate]);

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
  const classesById = useMemo(
    () => new Map(highlightedClasses.map((item) => [item.class_id, item])),
    [highlightedClasses],
  );
  const todayAttendanceRows = useMemo(
    () => buildTodayAttendanceRows({ attendanceRecords, highlightedClasses, today: currentDate }),
    [attendanceRecords, currentDate, highlightedClasses],
  );
  const visibleAttendanceRecords =
    attendanceView === "current"
      ? todayAttendanceRows
      : filterTeacherAttendanceByView(attendanceRecords, attendanceView).map((record) => {
          const classItem = classesById.get(record.class_id);
          return {
            ...record,
            start_time: record.start_time || classItem?.start_time || "",
            end_time: record.end_time || classItem?.end_time || "",
          };
        });
  const todayLabel = currentDate.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const scoreValue = teacherScore?.score ?? 100;
  const scoreMax = teacherScore?.max_score ?? 110;
  const scoreBand = getScoreBand(scoreValue);
  const isCheckoutPanel = attendancePanelAction === "checkout";
  const attendancePendingKey = isCheckoutPanel ? "attendance-check-out" : "attendance-check-in";
  const attendanceActionLabel = isCheckoutPanel ? "checkout" : "check-in";

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
      reason: trimmedReason,
      assignedManagerCode: selectedManagerCode || leaveRequestManagers[0]?.user_code || "",
    });

    if (success) {
      setIsCreatePanelOpen(false);
      setSelectedClassId("");
      setSelectedManagerCode("");
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
        const attendanceAction = isCheckoutPanel ? onCheckOutAttendance : onCheckInAttendance;
        const success = await attendanceAction({
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

  function handleResetLocationAccess() {
    if (!navigator.geolocation) {
      setAttendanceError("This browser does not support location access.");
      return;
    }

    setAttendanceError("");
    navigator.geolocation.getCurrentPosition(
      () => {
        setAttendanceError(`Location access is ready. You can confirm ${attendanceActionLabel} now.`);
      },
      (error) => {
        if (error.code === 1) {
          setAttendanceError("Location permission is blocked. On iOS, allow Location for Safari and this website in Settings, then try again.");
          return;
        }

        setAttendanceError(error.message || "Unable to refresh location access.");
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0,
      },
    );
  }

  return (
    <>
      <section className="monitor-grid monitor-grid-summary">
        <article className="info-card teacher-summary-card">
          <div className={`teacher-summary-metric teacher-score-metric teacher-score-${scoreBand}`}>
            <p className="eyebrow">Monthly Score</p>
            <h2>{scoreValue}/{scoreMax}</h2>
          </div>
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
            <h2>Check-in/Checkout Records</h2>
            <p className="subtle">
              Today: {todayLabel} | {getDayCode(currentDate)} | Classes scheduled: {todayAttendanceRows.length}
            </p>
          </div>
        </div>

        <div className="attendance-action-strip" aria-label="Attendance actions">
          <button
            type="button"
            className="attendance-action-card attendance-action-card-primary"
            disabled={pendingAction === "attendance-check-in"}
            onClick={() => {
              setAttendanceError("");
              setAttendancePanelAction("check-in");
              setIsAttendancePanelOpen(true);
            }}
          >
            <span>{pendingAction === "attendance-check-in" ? "Recording..." : "Check-in"}</span>
            <strong>Start teaching session</strong>
          </button>
          <button
            type="button"
            className="attendance-action-card"
            disabled={pendingAction === "attendance-check-out"}
            onClick={() => {
              setAttendanceError("");
              setAttendancePanelAction("checkout");
              setIsAttendancePanelOpen(true);
            }}
          >
            <span>{pendingAction === "attendance-check-out" ? "Recording..." : "Checkout"}</span>
            <strong>Finish teaching session</strong>
          </button>
        </div>

        <div className="attendance-records-head">
          <div>
            <p className="eyebrow">Records</p>
            <h3>Attendance records</h3>
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
            {
              key: "expected_shift",
              label: "Expected Shift",
              render: (row) =>
                row.start_time && row.end_time
                  ? `${formatTimeValue(row.start_time)} - ${formatTimeValue(row.end_time)}`
                  : "-",
            },
            { key: "checked_at", label: "Check-in", render: (row) => formatClockTimeValue(row.checked_at) },
            { key: "check_out_at", label: "Checkout", render: (row) => formatClockTimeValue(row.check_out_at) },
            {
              key: "nearest_center_name",
              label: "Location",
              render: (row) =>
                !row.checked_at || row.status === "VALID" || row.status === "MANUAL" || row.status === "-"
                  ? row.nearest_center_name || "Nearest center"
                  : "Outside valid area",
            },
            {
              key: "status",
              label: "Location Status",
              render: (row) => <StatusPill value={!row.checked_at || row.status === "-" ? "PENDING" : row.status || "PENDING"} />,
            },
            {
              key: "attendance_status",
              label: "Check-in Status",
              render: (row) => <StatusPill value={row.attendance_status || "UNMATCHED"} />,
            },
            {
              key: "checkout_status",
              label: "Checkout Status",
              render: (row) => <StatusPill value={row.checkout_status || "-"} />,
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
              disabled={creatableClasses.length === 0 || leaveRequestManagers.length === 0}
              onClick={() => {
                setSelectedClassId(creatableClasses[0]?.class_id || "");
                setSelectedManagerCode(leaveRequestManagers[0]?.user_code || "");
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
        {leaveRequestManagers.length === 0 ? (
          <p className="subtle">No active manager is available to review leave requests right now.</p>
        ) : null}

        <DataTable
          title="My Leave Requests"
          columns={[
            { key: "request_id", label: "Request ID" },
            { key: "class_id", label: "Class ID" },
            { key: "center_id", label: "Center" },
            { key: "assigned_manager_name", label: "Review Manager" },
            { key: "class_day_of_week", label: "Class Day" },
            { key: "request_date", label: "Request Date" },
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
          title={`Confirm ${attendanceActionLabel}`}
          titleId="attendance-confirm-title"
          onClose={() => setIsAttendancePanelOpen(false)}
        >
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
              disabled={pendingAction === attendancePendingKey}
              onClick={handleConfirmAttendance}
            >
              {pendingAction === attendancePendingKey ? "Recording..." : `Confirm ${attendanceActionLabel}`}
            </button>
            <button
              type="button"
              className="table-action-button table-action-button-muted"
              disabled={pendingAction === attendancePendingKey}
              onClick={handleResetLocationAccess}
            >
              Reset location
            </button>
            <button
              type="button"
              className="table-action-button table-action-button-muted"
              disabled={pendingAction === attendancePendingKey}
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
                          {item.class_id} | {item.day_of_week} | {item.center_label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Review Manager</span>
                    <select
                      value={selectedManagerCode}
                      onChange={(event) => setSelectedManagerCode(event.target.value)}
                      required
                    >
                      {leaveRequestManagers.map((manager) => (
                        <option key={manager.user_code} value={manager.user_code}>
                          {manager.display_name} ({manager.user_code})
                        </option>
                      ))}
                    </select>
                  </label>

                  {selectedClass ? (
                    <div className="floating-panel-summary">
                      <div className="floating-panel-summary-row">
                        <span>Day</span>
                        <strong>{formatValue(selectedClass.day_of_week)}</strong>
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
                      disabled={
                        !selectedClass ||
                        !selectedManagerCode ||
                        !reason.trim() ||
                        pendingAction === "create-leave-request"
                      }
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

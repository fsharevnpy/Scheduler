import { useEffect, useMemo, useState } from "react";

import DataTable from "./DataTable.jsx";
import FloatingPanel from "./FloatingPanel.jsx";
import StatusPill from "./StatusPill.jsx";
import TeacherClassCard from "./TeacherClassCard.jsx";
import { useLanguage } from "../../lib/i18n.jsx";
import { formatTimeValue, formatValue } from "./monitorUtils.js";
import {
  buildAttendanceHistoryRows, buildCurrentAttendanceRows, formatAttendanceDate,
  formatAttendanceTime, getAttendanceDateKey, getAttendanceDayCode,
} from "./attendanceUtils.js";

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
  teacherId,
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
  const { t } = useLanguage();
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
    const timer = window.setInterval(() => setCurrentDate(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

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
  const todayKey = getAttendanceDateKey(currentDate);
  const historicalAttendanceRows = useMemo(() => buildAttendanceHistoryRows(attendanceRecords), [attendanceRecords]);
  const todayAttendanceRows = useMemo(
    () => buildCurrentAttendanceRows({ records: attendanceRecords, classes: highlightedClasses, now: currentDate, teacherId }),
    [attendanceRecords, currentDate, highlightedClasses, teacherId],
  );
  const visibleAttendanceRecords = useMemo(
    () => attendanceView === "current"
      ? todayAttendanceRows
      : historicalAttendanceRows.filter((row) => attendanceView === "all" || row.attendance_date < todayKey),
    [attendanceView, todayAttendanceRows, historicalAttendanceRows, todayKey],
  );
  const todayLabel = formatAttendanceDate(todayKey);
  const scoreValue = teacherScore?.score ?? 100;
  const scoreMax = teacherScore?.max_score ?? 110;
  const scoreBand = getScoreBand(scoreValue);
  const isCheckoutPanel = attendancePanelAction === "checkout";
  const attendancePendingKey = isCheckoutPanel ? "attendance-check-out" : "attendance-check-in";
  const attendanceActionLabel = isCheckoutPanel ? t("checkOut") : t("checkIn");

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
      setAttendanceError(t("locationNotSupported"));
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
        setAttendanceError(error.message || t("locationReadFailed"));
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
      setAttendanceError(t("locationNotSupported"));
      return;
    }

    setAttendanceError("");
    navigator.geolocation.getCurrentPosition(
      () => {
        setAttendanceError(t("locationReady", { action: attendanceActionLabel }));
      },
      (error) => {
        if (error.code === 1) {
          setAttendanceError(t("locationPermissionBlocked"));
          return;
        }

        setAttendanceError(error.message || t("locationRefreshFailed"));
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
            <p className="eyebrow">{t("monthlyScore")}</p>
            <h2>{scoreValue}/{scoreMax}</h2>
          </div>
          <div className="teacher-summary-metric">
            <p className="eyebrow">{t("unassigned")}</p>
            <h2>{unassignedCount}</h2>
          </div>
          <div className="teacher-summary-metric">
            <p className="eyebrow">{t("leaveRequests")}</p>
            <h2>{activeLeaveRequestCount}</h2>
          </div>
          <div className="teacher-summary-metric">
            <p className="eyebrow">{t("attendance")}</p>
            <h2>{attendanceRecords.length}</h2>
          </div>
        </article>
      </section>

      <section className="dashboard-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">{t("attendance")}</p>
            <h2>{t("attendanceRecords")}</h2>
            <p className="subtle">
              {t("todaySummary", { date: todayLabel, day: getAttendanceDayCode(todayKey), count: todayAttendanceRows.length })}
            </p>
          </div>
        </div>

        <div className="attendance-action-strip" aria-label={t("attendanceActions")}>
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
            <span>{pendingAction === "attendance-check-in" ? t("recording") : t("checkIn")}</span>
            <strong>{t("startTeachingSession")}</strong>
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
            <span>{pendingAction === "attendance-check-out" ? t("recording") : t("checkOut")}</span>
            <strong>{t("finishTeachingSession")}</strong>
          </button>
        </div>

        <div className="attendance-records-head">
          <div>
            <p className="eyebrow">{t("records")}</p>
            <h3>{t("attendanceRecords")}</h3>
          </div>
          <div className="section-toggle-group" role="tablist" aria-label={t("attendance")}>
            <button
              type="button"
              className={`section-toggle-button ${attendanceView === "current" ? "active" : ""}`.trim()}
              onClick={() => setAttendanceView("current")}
            >
              {t("current")}
            </button>
            <button
              type="button"
              className={`section-toggle-button ${attendanceView === "history" ? "active" : ""}`.trim()}
              onClick={() => setAttendanceView("history")}
            >
              {t("history")}
            </button>
            <button
              type="button"
              className={`section-toggle-button ${attendanceView === "all" ? "active" : ""}`.trim()}
              onClick={() => setAttendanceView("all")}
            >
              {t("all")}
            </button>
          </div>
        </div>

        {!window.isSecureContext ? (
          <p className="status error">
            {t("insecureLocationWarning")}
          </p>
        ) : null}

        <div className={`status ${actionStatus.kind}`.trim()} aria-live="polite">
          {actionStatus.message}
        </div>
        {attendanceError ? <div className="status error">{attendanceError}</div> : null}
        {attendanceView !== "current" ? <p className="subtle">{t("attendanceHistoryHelp")}</p> : null}

        <DataTable
          key={attendanceView}
          title={t("attendanceRecords")}
          columns={[
            { key: "attendance_date", label: t("attendanceDate"), render: (row) => formatAttendanceDate(row.attendance_date) },
            { key: "class_id", label: t("classId") },
            {
              key: "expected_shift",
              label: t("expectedShift"),
              render: (row) =>
                row.start_time && row.end_time
                  ? `${formatTimeValue(row.start_time)} - ${formatTimeValue(row.end_time)}`
                  : "-",
            },
            { key: "checked_at", label: t("checkIn"), render: (row) => formatAttendanceTime(row.checked_at) },
            { key: "check_out_at", label: t("checkOut"), render: (row) => formatAttendanceTime(row.check_out_at) },
            {
              key: "nearest_center_name",
              label: t("location"),
              render: (row) =>
                (!row.checked_at && !row.check_out_at) || row.status === "VALID" || row.status === "MANUAL" || row.status === "-"
                  ? row.nearest_center_name || t("nearestCenter")
                  : t("outsideValidArea"),
            },
            {
              key: "status",
              label: t("locationStatus"),
              render: (row) => <StatusPill value={row.status === "-" ? "-" : row.status || "PENDING"} />,
            },
            {
              key: "attendance_status",
              label: t("attendanceStatus"),
              render: (row) => <StatusPill value={row.attendance_status || "UNMATCHED"} />,
            },
            {
              key: "checkout_status",
              label: t("checkOut"),
              render: (row) => <StatusPill value={row.checkout_status || "-"} />,
            },
            {
              key: "checkout_location_status",
              label: t("checkoutLocationStatus"),
              render: (row) => <StatusPill value={row.checkout_location_status || "-"} />,
            },
          ]}
          rows={visibleAttendanceRecords}
          resetPageOnRowsChange={false}
          emptyMessage={t("noAttendanceRecords")}
          embedded
          pageSize={10}
        />
      </section>

      <section className="dashboard-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">{t("class")}</p>
            <h2>{t("currentTeachingClasses")}</h2>
          </div>
        </div>
        {highlightedClasses.length === 0 ? (
          <p className="subtle">{t("noClassesAssigned")}</p>
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
            <p className="eyebrow">{t("myLeaveRequests")}</p>
            <h2>{t("personalLeaveRecords")}</h2>
          </div>
          <div className="section-head-actions">
	            <div className="section-toggle-group" role="tablist" aria-label={t("myLeaveRequests")}>
              <button
                type="button"
                className={`section-toggle-button ${leaveRequestView === "active" ? "active" : ""}`.trim()}
                onClick={() => setLeaveRequestView("active")}
              >
	                {t("active")}
              </button>
              <button
                type="button"
                className={`section-toggle-button ${leaveRequestView === "history" ? "active" : ""}`.trim()}
                onClick={() => setLeaveRequestView("history")}
              >
	                {t("history")}
              </button>
              <button
                type="button"
                className={`section-toggle-button ${leaveRequestView === "all" ? "active" : ""}`.trim()}
                onClick={() => setLeaveRequestView("all")}
              >
	                {t("all")}
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
	              {t("createLeaveRequest")}
            </button>
          </div>
        </div>

        {creatableClasses.length === 0 ? (
          <p className="subtle">
	            {t("noEligibleLeaveClasses")}
          </p>
        ) : null}
        {leaveRequestManagers.length === 0 ? (
	          <p className="subtle">{t("noActiveManagerForLeave")}</p>
        ) : null}

        <DataTable
	          title={t("myLeaveRequests")}
          columns={[
	            { key: "request_id", label: "Request ID" },
	            { key: "class_id", label: t("classId") },
	            { key: "center_id", label: t("center") },
	            { key: "assigned_manager_name", label: t("reviewManager") },
	            { key: "class_day_of_week", label: t("classDay") },
	            { key: "request_date", label: t("requestDate") },
	            { key: "reason", label: t("reason") },
            {
              key: "status",
	              label: t("status"),
              render: (row) => <StatusPill value={row.status} />,
            },
            {
              key: "actions",
	              label: t("actions"),
              render: (row) =>
                row.status === "REQUESTED" ? (
                  <button
                    type="button"
                    className="table-action-button table-action-button-muted"
                    disabled={pendingAction === `cancel-${row.request_id}`}
                    onClick={() => onCancelLeaveRequest(row.request_id)}
                  >
	                    {pendingAction === `cancel-${row.request_id}` ? t("cancelling") : t("cancel")}
                  </button>
                ) : (
	                  <span className="subtle">{t("processed")}</span>
                ),
            },
          ]}
          rows={visibleLeaveRequests}
	          emptyMessage={t("noLeaveRequests")}
          embedded
        />
      </section>

      {isAttendancePanelOpen ? (
        <FloatingPanel
	          eyebrow={t("attendance")}
	          title={t("confirmAttendance", { action: attendanceActionLabel })}
          titleId="attendance-confirm-title"
          onClose={() => setIsAttendancePanelOpen(false)}
        >
          <div className="floating-panel-reason-box">
            <p>
	              {t("attendanceConfirmCopy")}
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
	              {pendingAction === attendancePendingKey ? t("recording") : t("confirmAttendance", { action: attendanceActionLabel })}
            </button>
            <button
              type="button"
              className="table-action-button table-action-button-muted"
              disabled={pendingAction === attendancePendingKey}
              onClick={handleResetLocationAccess}
            >
	              {t("resetLocation")}
            </button>
            <button
              type="button"
              className="table-action-button table-action-button-muted"
              disabled={pendingAction === attendancePendingKey}
              onClick={() => setIsAttendancePanelOpen(false)}
            >
	              {t("cancel")}
            </button>
          </div>
        </FloatingPanel>
      ) : null}

      {isCreatePanelOpen ? (
        <FloatingPanel
	          eyebrow={t("myLeaveRequests")}
	          title={t("createLeaveRequestTitle")}
          titleId="teacher-leave-request-title"
          onClose={() => setIsCreatePanelOpen(false)}
        >
                <form className="floating-panel-form" onSubmit={handleCreateLeaveRequest}>
                  <label className="field">
	                    <span>{t("class")}</span>
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
	                    <span>{t("reviewManager")}</span>
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
	                        <span>{t("classDay")}</span>
                        <strong>{formatValue(selectedClass.day_of_week)}</strong>
                      </div>
                      <div className="floating-panel-summary-row">
	                        <span>{t("expectedShift")}</span>
                        <strong>
                          {formatTimeValue(selectedClass.start_time)} - {formatTimeValue(selectedClass.end_time)}
                        </strong>
                      </div>
                      <div className="floating-panel-summary-row">
	                        <span>{t("center")}</span>
                        <strong>{formatValue(selectedClass.center_label)}</strong>
                      </div>
                    </div>
                  ) : null}

                  <label className="field">
	                    <span>{t("reason")}</span>
                    <textarea
                      rows="4"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
	                      placeholder={t("reason")}
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
	                      {pendingAction === "create-leave-request" ? t("creating") : t("createRequest")}
                    </button>
                    <button
                      type="button"
                      className="table-action-button table-action-button-muted"
                      disabled={pendingAction === "create-leave-request"}
                      onClick={() => setIsCreatePanelOpen(false)}
                    >
	                      {t("close")}
                    </button>
                  </div>
                </form>
        </FloatingPanel>
      ) : null}
    </>
  );
}

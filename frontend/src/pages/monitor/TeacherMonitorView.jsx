import { useEffect, useMemo, useRef, useState } from "react";

import DataTable from "./DataTable.jsx";
import FloatingPanel from "./FloatingPanel.jsx";
import StatusPill from "./StatusPill.jsx";
import TeacherClassCard from "./TeacherClassCard.jsx";
import TeacherAttendanceRecords from "./TeacherAttendanceRecords.jsx";
import SectionNavigation from "./SectionNavigation.jsx";
import { AttendanceStudentsFields, SessionStudentsFields } from "./AttendanceStudents.jsx";
import { prepareCheckoutStudents } from "../../lib/attendanceStudents.js";
import { useLanguage } from "../../lib/i18n.jsx";
import { formatTimeValue, formatValue } from "./monitorUtils.js";
import {
  buildAttendanceHistoryRows, buildCurrentAttendanceRows, formatAttendanceDate,
  getAttendanceDateKey, formatAttendanceWeekday, formatAttendanceDayCode, getTeacherAttendanceAvailability,
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
  pendingAction,
  actionStatus,
  teacherScore,
  onCheckInAttendance,
  onCheckOutAttendance,
  onCreateLeaveRequest,
  onCancelLeaveRequest,
}) {
  const { t, language } = useLanguage();
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [isAttendancePanelOpen, setIsAttendancePanelOpen] = useState(false);
  const [attendancePanelAction, setAttendancePanelAction] = useState("check-in");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedManagerCode, setSelectedManagerCode] = useState("");
  const [reason, setReason] = useState("");
  const [attendanceError, setAttendanceError] = useState("");
  const [studentCount, setStudentCount] = useState("");
  const [studentNames, setStudentNames] = useState([]);
  const [sessionStudentDrafts, setSessionStudentDrafts] = useState({});
  const [isReadingLocation, setIsReadingLocation] = useState(false);
  const attendanceRequest = useRef(0);
  const [activeSection, setActiveSection] = useState("today");
  const [attendanceView, setAttendanceView] = useState("history");
  const [leaveRequestView, setLeaveRequestView] = useState("active");
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentDate(new Date()), 30000);
    return () => {
      window.clearInterval(timer);
      attendanceRequest.current += 1;
    };
  }, []);

  useEffect(() => {
    setCurrentDate(new Date());
  }, [attendanceRecords]);

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
    () => buildCurrentAttendanceRows({ historyRows: historicalAttendanceRows, classes: highlightedClasses, now: currentDate, teacherId }),
    [historicalAttendanceRows, currentDate, highlightedClasses, teacherId],
  );
  const visibleAttendanceRecords = useMemo(
    () => historicalAttendanceRows.filter((row) => attendanceView === "all" || row.attendance_date < todayKey),
    [attendanceView, historicalAttendanceRows, todayKey],
  );
  const { todayClasses, availableClasses, openCheckIn, nextSessionBlock } = useMemo(
    () => getTeacherAttendanceAvailability({ records: attendanceRecords, classes: highlightedClasses, teacherId, now: currentDate }),
    [attendanceRecords, highlightedClasses, teacherId, currentDate],
  );
  const currentBlock = openCheckIn ? openCheckIn.session_block : nextSessionBlock;
  const featuredClass = currentBlock?.[0] || (openCheckIn && {
    class_id: openCheckIn.session_class_id || openCheckIn.class_id,
    center_id: openCheckIn.session_center_id,
    start_time: openCheckIn.session_start_time,
    end_time: openCheckIn.session_end_time,
  }) || availableClasses[0] || todayClasses[todayClasses.length - 1];
  const featuredEnd = currentBlock?.[currentBlock.length - 1]?.end_time || featuredClass?.end_time;
  const checkInUnavailable = !availableClasses.length;
  const checkOutUnavailable = !openCheckIn;
  const anyAttendancePending = isReadingLocation || ["attendance-check-in", "attendance-check-out"].includes(pendingAction);
  const todayLabel = formatAttendanceDate(todayKey);
  const scoreValue = teacherScore?.score ?? 100;
  const scoreMax = teacherScore?.max_score ?? 110;
  const scoreBand = getScoreBand(scoreValue);
  const isCheckoutPanel = attendancePanelAction === "checkout";
  const attendancePendingKey = isCheckoutPanel ? "attendance-check-out" : "attendance-check-in";
  const attendanceActionLabel = isCheckoutPanel ? t("checkOut") : t("checkIn");
  const attendanceBusy = isReadingLocation || pendingAction === attendancePendingKey;

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

  function handleConfirmAttendance(event) {
    event.preventDefault();
    if (attendanceBusy) return;
    if ((!isCheckoutPanel && checkInUnavailable) || (isCheckoutPanel && checkOutUnavailable)) {
      setAttendanceError(isCheckoutPanel ? "no open check-in found for today" : "no assigned teaching session available for attendance");
      return;
    }
    const students = prepareCheckoutStudents(openCheckIn?.session_block, sessionStudentDrafts, studentCount, studentNames);
    const error = isCheckoutPanel ? students.error : "";
    if (error) {
      setAttendanceError(error);
      return;
    }
    if (!navigator.geolocation) {
      setAttendanceError(t("locationNotSupported"));
      return;
    }

    setAttendanceError("");
    setIsReadingLocation(true);
    const requestId = ++attendanceRequest.current;
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (requestId !== attendanceRequest.current) return;
        try {
          const attendanceAction = isCheckoutPanel ? onCheckOutAttendance : onCheckInAttendance;
          const success = await attendanceAction({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            ...(isCheckoutPanel ? students.payload : {}),
          });
          if (success && requestId === attendanceRequest.current) {
            setIsAttendancePanelOpen(false);
            setStudentCount("");
            setStudentNames([]);
            setSessionStudentDrafts({});
          }
        } catch (cause) {
          if (requestId === attendanceRequest.current) setAttendanceError(cause.message);
        } finally {
          if (requestId === attendanceRequest.current) setIsReadingLocation(false);
        }
      },
      (error) => {
        if (requestId !== attendanceRequest.current) return;
        setIsReadingLocation(false);
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
      <section className="teacher-secondary-summary" aria-label={t("Your overview")}>
        <div className={`teacher-secondary-metric teacher-score-${scoreBand}`}><span>{t("monthlyScore")}</span><strong>{scoreValue}/{scoreMax}</strong></div>
        <div className="teacher-secondary-metric"><span>{t("Scheduled sessions today")}</span><strong>{todayClasses.length}</strong></div>
        <div className="teacher-secondary-metric"><span>{t("leaveRequests")}</span><strong>{activeLeaveRequestCount}</strong></div>
        <div className="teacher-secondary-metric"><span>{t("Attendance events")}</span><strong>{attendanceRecords.length}</strong></div>
      </section>

      <section className="dashboard-section teacher-today-overview" aria-labelledby="teacher-today-title">
        <p className="eyebrow">{t("Today")}</p>
        <h2 id="teacher-today-title">{formatAttendanceWeekday(todayKey, language)} | {todayLabel}</h2>
        {featuredClass ? (
          <div className="teacher-featured-session">
            <strong>
              {openCheckIn?.nearest_center_name || featuredClass.center_label || featuredClass.center_id || "-"}
              {" — "}
              {t(currentBlock?.length > 2 ? "{count} sessions" : currentBlock?.length === 2 ? "Double session" : "Single session", { count: currentBlock?.length })}
            </strong>
            <span>{featuredClass.start_time && featuredEnd
              ? `${formatTimeValue(featuredClass.start_time)} - ${formatTimeValue(featuredEnd)}` : t("Shift time not recorded")}</span>
            <span>{t(openCheckIn ? "Teaching in progress" : todayAttendanceRows.some((row) => row.check_out_at) ? "Last visit completed" : "Not checked in")}</span>
          </div>
        ) : <p className="subtle">{t("No classes scheduled today.")}</p>}

        <div className="attendance-action-strip" aria-label={t("attendanceActions")}>
          <button
            type="button"
            className={`attendance-action-card${openCheckIn ? "" : " attendance-action-card-primary"}`}
            disabled={anyAttendancePending || checkInUnavailable}
            aria-describedby={checkInUnavailable ? "teacher-checkin-help" : undefined}
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
            className={`attendance-action-card${openCheckIn ? " attendance-action-card-primary" : ""}`}
            disabled={anyAttendancePending || checkOutUnavailable}
            aria-describedby={checkOutUnavailable ? "teacher-checkout-help" : undefined}
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

        {checkInUnavailable ? <p id="teacher-checkin-help" className="subtle">{t("No assigned session is available for check-in. Contact your manager if the schedule is incorrect.")}</p> : null}
        {checkOutUnavailable ? <p id="teacher-checkout-help" className="subtle">{t("Check in before ending a teaching session.")}</p> : null}

        {!window.isSecureContext ? (
          <p className="status error">
            {t("insecureLocationWarning")}
          </p>
        ) : null}

        <div className={`status ${actionStatus.kind}`.trim()} aria-live="polite">
          {actionStatus.message}
        </div>
        {attendanceError ? <div className="status error">{t(attendanceError)}</div> : null}
      </section>

      <SectionNavigation prefix="teacher" label="Teacher sections" activeSection={activeSection} onChange={setActiveSection} sections={[
        { id: "today", label: "Today's attendance", piece: "king" },
        { id: "history", label: "Attendance history", piece: "bishop" },
        { id: "schedule", label: "My teaching schedule", piece: "rook" },
        { id: "leave", label: "Leave Requests", piece: "knight", count: leaveRequests.filter((item) => item.status === "REQUESTED").length },
      ]} />

      <section id="teacher-today" className="dashboard-section manager-section" role="tabpanel" aria-labelledby="teacher-tab-today" hidden={activeSection !== "today"} tabIndex={0}>
        <h2>{t("Today's attendance")}</h2>
        <TeacherAttendanceRecords rows={todayAttendanceRows} />
      </section>

      <section id="teacher-history" className="dashboard-section manager-section" role="tabpanel" aria-labelledby="teacher-tab-history" hidden={activeSection !== "history"} tabIndex={0}>
        <div className="section-head">
          <h2>{t("Attendance history")}</h2>
          <div className="section-toggle-group" aria-label={t("Attendance filter")}>
            {["history", "all"].map((view) => <button key={view} type="button" className={`section-toggle-button${attendanceView === view ? " active" : ""}`}
              aria-pressed={attendanceView === view} onClick={() => setAttendanceView(view)}>{t(view)}</button>)}
          </div>
        </div>
        <p className="subtle">{t("attendanceHistoryHelp")}</p>
        <TeacherAttendanceRecords key={attendanceView} rows={visibleAttendanceRecords} />
      </section>

      <section id="teacher-schedule" className="dashboard-section manager-section" role="tabpanel" aria-labelledby="teacher-tab-schedule" hidden={activeSection !== "schedule"} tabIndex={0}>
        <div className="section-head">
          <div>
            <p className="eyebrow">{t("class")}</p>
            <h2>{t("My teaching schedule")}</h2>
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

      <section id="teacher-leave" className="dashboard-section manager-section" role="tabpanel" aria-labelledby="teacher-tab-leave" hidden={activeSection !== "leave"} tabIndex={0}>
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
	            { key: "request_id", label: t("Request ID") },
	            { key: "class_id", label: t("classId") },
	            { key: "center_id", label: t("center") },
	            { key: "assigned_manager_name", label: t("reviewManager") },
	            { key: "class_day_of_week", label: t("classDay"), render: (row) => formatAttendanceDayCode(row.class_day_of_week, language) },
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
          closeDisabled={attendanceBusy}
        >
          <form onSubmit={handleConfirmAttendance}>
          {isCheckoutPanel ? (
            openCheckIn?.session_block?.length > 1
              ? <SessionStudentsFields block={openCheckIn.session_block} drafts={sessionStudentDrafts}
                  onChange={setSessionStudentDrafts} disabled={attendanceBusy} />
              : <AttendanceStudentsFields count={studentCount} names={studentNames}
                  onCountChange={setStudentCount} onNamesChange={setStudentNames} disabled={attendanceBusy} />
          ) : null}
          {attendanceError ? <div className="status error" role="alert">{t(attendanceError)}</div> : null}

          <div className="floating-panel-actions">
            {actionStatus.kind === "error" ? <div className="status error" role="alert">{t(actionStatus.message)}</div> : null}
            <button
              type="submit"
              className="table-action-button"
              disabled={attendanceBusy}
            >
	              {pendingAction === attendancePendingKey ? t("recording") : isReadingLocation ? t("Reading location...") : t("confirmAttendance", { action: attendanceActionLabel })}
            </button>
            <button
              type="button"
              className="table-action-button table-action-button-muted"
              disabled={attendanceBusy}
              onClick={handleResetLocationAccess}
            >
	              {t("resetLocation")}
            </button>
            <button
              type="button"
              className="table-action-button table-action-button-muted"
              disabled={attendanceBusy}
              onClick={() => setIsAttendancePanelOpen(false)}
            >
	              {t("cancel")}
            </button>
          </div>
          </form>
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
                          {item.class_id} | {formatAttendanceDayCode(item.day_of_week, language)} | {item.center_label}
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
                        <strong>{formatAttendanceDayCode(selectedClass.day_of_week, language)}</strong>
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

import { useEffect, useMemo, useState } from "react";

import UserAvatar from "../../components/UserAvatar.jsx";
import BackupManagement from "./BackupManagement.jsx";
import AttendanceReportPanel from "./AttendanceReportPanel.jsx";
import { useLanguage } from "../../lib/i18n.jsx";
import { getRoleTitle } from "../../lib/roles.js";
import DataTable from "./DataTable.jsx";
import FloatingPanel from "./FloatingPanel.jsx";
import StatusPill from "./StatusPill.jsx";
import { formatDateTimeValue, formatTimeDraft, formatTimeValue, formatValue } from "./monitorUtils.js";
import {
  buildAttendanceHistoryRows, buildCurrentAttendanceRows, formatAttendanceDate,
  formatAttendanceTime, getAttendanceDateKey, formatAttendanceWeekday, formatAttendanceDayCode, getAttendanceDateKeys,
} from "./attendanceUtils.js";

const ACTIVE_LEAVE_STATUSES = new Set(["REQUESTED", "APPROVED"]);
const HISTORY_LEAVE_STATUSES = new Set(["CANCELLED", "REJECTED"]);
const CLASS_DAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const REASSIGNMENT_MODES = [
  {
    value: "TEMPORARY",
    title: "Temporary",
    description: "For the selected teaching date only.",
  },
  {
    value: "PERMANENT",
    title: "Permanent",
    description: "Replace the fixed assignment for all future days.",
  },
];

function getDatetimeLocalValue(date = new Date()) {
  return `${getAttendanceDateKey(date)}T${formatAttendanceTime(date)}`;
}

function upcomingTeachingDates(day) {
  const today = new Date(`${getAttendanceDateKey()}T00:00:00Z`);
  const weekday = (today.getUTCDay() + 6) % 7;
  const offset = (CLASS_DAYS.indexOf(day) - weekday + 7) % 7;
  return Array.from({ length: 52 }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() + offset + index * 7);
    return date.toISOString().slice(0, 10);
  });
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

function getClassTeacherIds(classItem) {
  return classItem.teacher_ids || (classItem.teacher_id ? [classItem.teacher_id] : []);
}

function getClassTeacherModes(classItem) {
  const teacherIds = getClassTeacherIds(classItem);
  const modes = classItem.teacher_assignment_modes || [];

  return teacherIds.map((_, index) => modes[index] || "PERMANENT");
}

function renderTeacherNames(t, label, teacherIds = [], teacherModes = [], originalTeacherIds = [], onSelect = null) {
  if (!label || label === "-") {
    return <span>-</span>;
  }

  const teacherNames = String(label)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return (
    <span className="class-teacher-list">
      {teacherNames.map((item, index) => {
        const teacherId = teacherIds[index] || "";
        const teacherMode = teacherModes[index] || "PERMANENT";
        const originalTeacherId = originalTeacherIds[index] || teacherId;
        const isTemporary = teacherMode === "TEMPORARY";
        const className = `class-teacher-button${isTemporary ? " temporary" : ""}`;
        const plainClassName = `class-teacher-name${isTemporary ? " temporary" : ""}`;

        if (!onSelect || !teacherId) {
          return (
            <span className={plainClassName} key={`${teacherId}-${item}`}>
              {item}
            </span>
          );
        }

        return (
          <button
            type="button"
            className={className}
            key={`${teacherId}-${item}`}
            onClick={() => onSelect(teacherId, item, teacherMode, originalTeacherId)}
            title={isTemporary ? t("Temporary assignment for today") : t("Permanent assignment")}
          >
            {item}
          </button>
        );
      })}
    </span>
  );
}



export default function AdminMonitorView({
  actionStatus,
  attendanceRecords,
  apiBase,
  token,
  centers = [],
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
  onRemoveClassTeacher,
  onReassignClassTeacher,
  onRestorePermanentClassTeacher,
  onRejectLeaveRequest,
  onLoadReplacementSuggestions,
  onResetPasswordRequest,
  onUpdateTeacherActive,
  onUpdateTeacherProfile,
  onDeleteTeacherProfileImage,
  onCreateTeacherScoreEvent,
  onCreateManualAttendance,
  onUpdateClassTime,
}) {
  const { t, language } = useLanguage();
  const [selectedLeaveRequest, setSelectedLeaveRequest] = useState(null);
  const [selectedSuggestionTeacher, setSelectedSuggestionTeacher] = useState(null);
  const [selectedSuggestionClass, setSelectedSuggestionClass] = useState(null);
  const [selectedSuggestionTeacherIds, setSelectedSuggestionTeacherIds] = useState([]);
  const [selectedClassTeacher, setSelectedClassTeacher] = useState(null);
  const [classTeacherAction, setClassTeacherAction] = useState("manage");
  const [classTeacherSuggestions, setClassTeacherSuggestions] = useState([]);
  const [selectedReassignTeacherId, setSelectedReassignTeacherId] = useState("");
  const [selectedReassignMode, setSelectedReassignMode] = useState("TEMPORARY");
  const [selectedReassignDate, setSelectedReassignDate] = useState("");
  const [showReassignDates, setShowReassignDates] = useState(false);
  const [selectedAvatarTeacher, setSelectedAvatarTeacher] = useState(null);
  const [selectedTeacherDetail, setSelectedTeacherDetail] = useState(null);
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
  const [attendanceDatePage, setAttendanceDatePage] = useState(1);
  const [leaveRequestView, setLeaveRequestView] = useState("active");
  const [assignmentCenterPage, setAssignmentCenterPage] = useState(1);
  const [isManualAttendancePanelOpen, setIsManualAttendancePanelOpen] = useState(false);
  const [isAttendanceExportPanelOpen, setIsAttendanceExportPanelOpen] = useState(false);



  const [manualAttendanceForm, setManualAttendanceForm] = useState({
    event_type: "CHECK_IN",
    teacher_id: "",
    center_id: "",
    checked_date: getDatetimeLocalValue().slice(0, 10),
    checked_time: getDatetimeLocalValue().slice(11, 16),
  });
  const [selectedClassTime, setSelectedClassTime] = useState(null);
  const [classTimeForm, setClassTimeForm] = useState({
    start_time: "",
    end_time: "",
  });
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    if (!selectedLeaveRequest) {
      return;
    }

    const nextSelected = leaveRequests.find((item) => item.request_id === selectedLeaveRequest.request_id) || null;
    setSelectedLeaveRequest(nextSelected);
  }, [leaveRequests, selectedLeaveRequest]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentDate(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setAttendanceDatePage(1);
  }, [attendanceView]);

  const assignmentsByCenter = replacementQueue.reduce((groups, item) => {
    const key = item.center_id || "UNKNOWN";
    if (!groups[key]) {
      groups[key] = {
        centerId: key,
        label: item.center_label || key,
        classes: [],
      };
    }
    groups[key].classes.push(item);
    return groups;
  }, {});
  const assignmentCenterEntries = Object.values(assignmentsByCenter).sort((left, right) => left.centerId.localeCompare(right.centerId));
  const assignmentCenterPageCount = Math.max(1, assignmentCenterEntries.length);
  const currentAssignmentCenterEntry =
    assignmentCenterEntries[Math.min(assignmentCenterPage - 1, assignmentCenterPageCount - 1)] || null;
  const currentAssignmentCenterLabel = currentAssignmentCenterEntry?.label || "";
  const currentAssignmentClasses = currentAssignmentCenterEntry?.classes || [];
  const teachersById = new Map(teachers.map((item) => [item.teacher_id, item]));
  const activeLeaveRequestCount = leaveRequests.filter((item) => ACTIVE_LEAVE_STATUSES.has(item.status)).length;
  const visibleLeaveRequests = filterLeaveRequestsByView(leaveRequests, leaveRequestView);
  const todayKey = getAttendanceDateKey(currentDate);
  const historicalAttendanceRows = useMemo(() => buildAttendanceHistoryRows(attendanceRecords), [attendanceRecords]);
  const todayAttendanceRows = useMemo(
    () => buildCurrentAttendanceRows({ records: attendanceRecords, classes, teachers, now: currentDate }),
    [attendanceRecords, classes, teachers, currentDate],
  );
  const attendanceDateKeys = getAttendanceDateKeys(historicalAttendanceRows, attendanceView, todayKey);
  const attendanceDatePageCount = Math.max(1, attendanceDateKeys.length);
  const effectiveAttendanceDatePage = Math.min(attendanceDatePage, attendanceDatePageCount);
  const selectedAttendanceDateKey = attendanceDateKeys[effectiveAttendanceDatePage - 1] || "";
  const visibleAttendanceRecords = useMemo(
    () => attendanceView === "current"
      ? todayAttendanceRows
      : historicalAttendanceRows.filter((row) => row.attendance_date === selectedAttendanceDateKey),
    [attendanceView, todayAttendanceRows, historicalAttendanceRows, selectedAttendanceDateKey],
  );
  const todayLabel = formatAttendanceDate(todayKey);
  const selectedAttendanceDateLabel = formatAttendanceDate(selectedAttendanceDateKey);
  const scoresByTeacherId = new Map(teacherScores.map((item) => [item.teacher_id, item]));
  const selectedClassSuggestions = selectedSuggestionClass
    ? replacementSuggestions[selectedSuggestionClass.class_id] ?? []
    : [];
  const selectedClassTeacherCount = selectedSuggestionClass
    ? selectedSuggestionClass.teacher_count || selectedSuggestionClass.teacher_ids?.length || (selectedSuggestionClass.teacher_id ? 1 : 0)
    : 0;
  const selectedClassAvailableTeacherSlots = Math.max(0, 2 - selectedClassTeacherCount);
  const selectedTeacherAssignedClasses = selectedTeacherDetail
    ? classes.filter((item) =>
        item.teacher_ids?.length > 0
          ? item.teacher_ids.includes(selectedTeacherDetail.teacher_id)
          : item.teacher_id === selectedTeacherDetail.teacher_id,
      )
    : [];
  const selectedTeacherTodayRows = selectedTeacherDetail
    ? todayAttendanceRows.filter((item) => item.teacher_id === selectedTeacherDetail.teacher_id)
    : [];

  useEffect(() => {
    setAssignmentCenterPage((current) => Math.min(current, assignmentCenterPageCount));
  }, [assignmentCenterPageCount]);

  useEffect(() => {
    setAttendanceDatePage((current) => Math.min(current, attendanceDatePageCount));
  }, [attendanceDatePageCount]);

  const profileEditMeta = {
    elo: {
      label: t("ELO"),
      inputProps: { type: "number", min: "0", required: true },
      normalize: (value) => Number(value),
    },
    education_score: {
      label: t("Education"),
      inputProps: { type: "number", min: "0", max: "10", step: "0.1", placeholder: "0 - 10" },
      normalize: (value) => (value === "" ? null : Number(value)),
    },
    max_slots_per_day: {
      label: t("Max Slots / Day"),
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
          throw new Error(payload.detail || t("Failed to load score events"));
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

    setProfilePanelStatus({ kind: "success", message: "Teacher profile updated." });
    setSelectedProfileEdit((current) => (current ? { ...current, teacher: { ...current.teacher, ...payload } } : current));
  }

  async function handleDeleteTeacherAvatar() {
    if (!selectedAvatarTeacher?.profile_image_url) {
      return;
    }

    if (!confirm(t("Delete profile image for {p0} - {p1}?", { p0: selectedAvatarTeacher.teacher_id, p1: selectedAvatarTeacher.name }))) {
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

    const delta = Number(scoreForm.delta);
    if (!scoreForm.delta.trim() || !Number.isInteger(delta) || delta === 0) {
      setScorePanelStatus({ kind: "error", message: "Enter a non-zero whole number of points." });
      return;
    }
    if (!scoreForm.reason.trim()) {
      setScorePanelStatus({ kind: "error", message: "Please enter a reason." });
      return;
    }

    const evidenceUrl = scoreForm.evidence_url.trim();
    if (evidenceUrl) {
      try {
        const url = new URL(evidenceUrl);
        if (!["https:", "http:"].includes(url.protocol)) throw new Error();
      } catch {
        setScorePanelStatus({ kind: "error", message: "Enter a valid evidence link or leave it empty." });
        return;
      }
    }
    setScorePanelStatus({ kind: "", message: "" });

    const success = await onCreateTeacherScoreEvent(selectedScoreTeacher.teacher_id, {
      score_month: new Date().toISOString().slice(0, 10),
      delta,
      reason: scoreForm.reason.trim(),
      evidence_text: scoreForm.evidence_text.trim() || null,
      evidence_url: evidenceUrl || null,
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

  function openManualAttendancePanel() {
    setManualAttendanceForm({
      event_type: "CHECK_IN",
      teacher_id: teachers[0]?.teacher_id || "",
      center_id: centers[0]?.center_id || "",
      checked_date: getDatetimeLocalValue().slice(0, 10),
      checked_time: getDatetimeLocalValue().slice(11, 16),
    });
    setIsManualAttendancePanelOpen(true);
  }

  function openAttendanceExportPanel() { setIsAttendanceExportPanelOpen(true); }



  async function handleManualAttendanceSubmit(event) {
    event.preventDefault();

    if (!manualAttendanceForm.teacher_id || !manualAttendanceForm.center_id || !manualAttendanceForm.checked_date || !manualAttendanceForm.checked_time) {
      return;
    }

    const success = await onCreateManualAttendance({
      teacherId: manualAttendanceForm.teacher_id,
      centerId: manualAttendanceForm.center_id,
      checkedAt: new Date(`${manualAttendanceForm.checked_date}T${manualAttendanceForm.checked_time}:00+07:00`).toISOString(),
      eventType: manualAttendanceForm.event_type,
    });

    if (success) {
      setIsManualAttendancePanelOpen(false);
    }
  }

  function openClassTimePanel(classItem) {
    setSelectedClassTime(classItem);
    setClassTimeForm({
      start_time: formatTimeValue(classItem.start_time),
      end_time: formatTimeValue(classItem.end_time),
    });
  }

  async function handleClassTimeSubmit(event) {
    event.preventDefault();

    if (!selectedClassTime) {
      return;
    }

    const success = await onUpdateClassTime(selectedClassTime.class_id, {
      start_time: classTimeForm.start_time,
      end_time: classTimeForm.end_time,
    });

    if (success) {
      setSelectedClassTime(null);
    }
  }

  async function openSuggestionPanel(item) {
    setSelectedSuggestionClass(item);
    setSelectedSuggestionTeacherIds([]);
    await onLoadReplacementSuggestions(item.class_id);
  }

  function toggleSuggestionTeacher(teacherId) {
    setSelectedSuggestionTeacherIds((current) => {
      if (current.includes(teacherId)) {
        return current.filter((item) => item !== teacherId);
      }

      if (current.length >= selectedClassAvailableTeacherSlots) {
        return current;
      }

      return [...current, teacherId];
    });
  }

  async function assignSelectedSuggestions() {
    if (!selectedSuggestionClass || selectedSuggestionTeacherIds.length === 0) {
      return;
    }

    let allSucceeded = true;
    for (const teacherId of selectedSuggestionTeacherIds) {
      const success = await onAssignReplacement(selectedSuggestionClass.class_id, teacherId);
      if (!success) {
        allSucceeded = false;
        break;
      }
    }

    if (allSucceeded) {
      setSelectedSuggestionClass(null);
      setSelectedSuggestionTeacherIds([]);
    }
  }

  async function openClassTeacherPanel(classItem, teacherId, teacherName, assignmentMode = "PERMANENT", originalTeacherId = teacherId, effectiveDate = null) {
    setSelectedClassTeacher({ classItem, teacherId, teacherName, assignmentMode, originalTeacherId });
    setClassTeacherAction("manage");
    setClassTeacherSuggestions([]);
    setSelectedReassignTeacherId("");
    setSelectedReassignMode("TEMPORARY");
    setSelectedReassignDate(effectiveDate || upcomingTeachingDates(classItem.day_of_week)[0]);
    setShowReassignDates(false);
  }

  async function openReassignClassTeacher() {
    if (!selectedClassTeacher) {
      return;
    }

    setClassTeacherAction("reassign");
    setSelectedReassignMode("TEMPORARY");
    const suggestions = await onLoadReplacementSuggestions(
      selectedClassTeacher.classItem.class_id,
      selectedClassTeacher.originalTeacherId || selectedClassTeacher.teacherId,
    );
    setClassTeacherSuggestions(suggestions);
    setSelectedReassignTeacherId(suggestions[0]?.teacher_id || "");
  }

  async function handleRemoveClassTeacher() {
    if (!selectedClassTeacher) {
      return;
    }

    const success = await onRemoveClassTeacher(selectedClassTeacher.classItem.class_id, selectedClassTeacher.teacherId);
    if (success) {
      setSelectedClassTeacher(null);
    }
  }

  async function handleRestorePermanentClassTeacher() {
    if (!selectedClassTeacher) {
      return;
    }

    const confirmed = window.confirm(t("Restore this class to its permanent teacher now?"));
    if (!confirmed) {
      return;
    }

    const success = await onRestorePermanentClassTeacher(
      selectedClassTeacher.classItem.class_id,
      selectedClassTeacher.originalTeacherId || selectedClassTeacher.teacherId,
      selectedReassignDate,
    );

    if (success) {
      setSelectedClassTeacher(null);
      setClassTeacherSuggestions([]);
      setSelectedReassignTeacherId("");
      setSelectedReassignMode("TEMPORARY");
    }
  }

  async function handleReassignClassTeacher() {
    if (!selectedClassTeacher || !selectedReassignTeacherId) {
      return;
    }

    const success = await onReassignClassTeacher(
      selectedClassTeacher.classItem.class_id,
      selectedClassTeacher.originalTeacherId || selectedClassTeacher.teacherId,
      selectedReassignTeacherId,
      selectedReassignMode,
      selectedReassignDate,
    );
    if (success) {
      setSelectedClassTeacher(null);
      setClassTeacherSuggestions([]);
      setSelectedReassignTeacherId("");
      setSelectedReassignMode("TEMPORARY");
    }
  }

  return (
    <>
      <section className="monitor-grid monitor-grid-summary">
        <article className="info-card">
          <p className="eyebrow">{t("Teachers")}</p>
          <h2>{teachers.length}</h2>
          <p className="subtle">{t("All available teacher records.")}</p>
        </article>

        <article className="info-card">
          <p className="eyebrow">{t("Classes")}</p>
          <h2>{classes.length}</h2>
          <p className="subtle">{t("All classes currently in the system.")}</p>
        </article>

        <article className="info-card">
          <p className="eyebrow">{t("Leave Requests")}</p>
          <h2>{activeLeaveRequestCount}</h2>
          <p className="subtle">{t("Active leave request records.")}</p>
        </article>

        <article className="info-card">
          <p className="eyebrow">{t("Attendance")}</p>
          <h2>{attendanceRecords.length}</h2>
          <p className="subtle">{t("Recorded attendance events from users.")}</p>
        </article>

        {role === "developer" ? (
          <article className="info-card">
            <p className="eyebrow">{t("Managers")}</p>
            <h2>{managerUsers.length}</h2>
            <p className="subtle">{t("Manager accounts visible to developer.")}</p>
          </article>
        ) : null}
      </section>

      {role === "developer" ? (
        <BackupManagement apiBase={apiBase} token={token} />
      ) : null}

      <section className="dashboard-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">{t("Attendance")}</p>
            <div className="section-title-row">
              <h2>{t("Attendance records")}</h2>
              <button
                type="button"
                className="section-add-button"
                onClick={openManualAttendancePanel}
                aria-label={t("Create manual attendance event")}
                title={t("Create manual attendance event")}
              >
                +
              </button>
              <button
                type="button"
                className="table-action-button"
                onClick={openAttendanceExportPanel}
              >{t("Export Excel")}{" "}</button>
            </div>
            <p className="subtle">
              {attendanceView === "current"
                ? t("Today: {date} | {day} | Rows: {count} (UTC+7)", { date: todayLabel, day: formatAttendanceWeekday(todayKey, language), count: todayAttendanceRows.length })
                : t("{view}: {date} | Recorded sessions: {count} (UTC+7)", { view: t(attendanceView === "history" ? "History" : "All"), date: selectedAttendanceDateLabel, count: visibleAttendanceRecords.length })}
            </p>
          </div>
          <div className="section-toggle-group" role="tablist" aria-label={t("Attendance filter")}>
            <button
              type="button"
              className={`section-toggle-button ${attendanceView === "current" ? "active" : ""}`.trim()}
              onClick={() => setAttendanceView("current")}
            >{t("Current")}{" "}</button>
            <button
              type="button"
              className={`section-toggle-button ${attendanceView === "history" ? "active" : ""}`.trim()}
              onClick={() => setAttendanceView("history")}
            >{t("History")}{" "}</button>
            <button
              type="button"
              className={`section-toggle-button ${attendanceView === "all" ? "active" : ""}`.trim()}
              onClick={() => setAttendanceView("all")}
            >{t("All")}{" "}</button>
          </div>
        </div>

        {attendanceView !== "current" ? (
          <p className="subtle">{t("Recorded events only. Older records without a saved shift show “-”; absence is not inferred from the current schedule.")}</p>
        ) : null}
        <DataTable
          key={`${attendanceView}:${selectedAttendanceDateKey}`}
          title={t("Attendance records")}
          columns={[
            { key: "date", label: t("Date"), render: (row) => formatAttendanceDate(row.attendance_date) },
            { key: "weekday", label: t("Weekday"), render: (row) => formatAttendanceWeekday(row.attendance_date, language) },
            { key: "display_name", label: t("User") },
            { key: "user_code", label: t("User Code") },
            { key: "teacher_id", label: t("Teacher ID") },
            { key: "class_id", label: t("Class ID") },
            {
              key: "expected_shift",
              label: t("Expected Shift"),
              render: (row) =>
                row.start_time && row.end_time
                  ? `${formatTimeValue(row.start_time)} - ${formatTimeValue(row.end_time)}`
                  : "-",
            },
            {
              key: "checked_at",
              label: t("Check-in"),
              render: (row) => formatAttendanceTime(row.checked_at),
            },
            { key: "check_out_at", label: t("Checkout"), render: (row) => formatAttendanceTime(row.check_out_at) },
            {
              key: "nearest_center_name",
              label: t("Location"),
              render: (row) =>
                (!row.checked_at && !row.check_out_at) || row.status === "VALID" || row.status === t("MANUAL") || row.status === "-"
                  ? row.nearest_center_name || t("Nearest center")
                  : t("status_INVALID"),
            },
            {
              key: "status",
              label: t("Location Status"),
              render: (row) => <StatusPill value={row.status === "-" ? "-" : row.status || "PENDING"} />,
            },
            {
              key: "attendance_status",
              label: t("Check-in Status"),
              render: (row) => <StatusPill value={row.attendance_status || t("UNMATCHED")} />,
            },
            {
              key: "checkout_status",
              label: t("Checkout Status"),
              render: (row) => <StatusPill value={row.checkout_status || "-"} />,
            },
            {
              key: "checkout_location_status",
              label: t("Checkout Location Status"),
              render: (row) => <StatusPill value={row.checkout_location_status || "-"} />,
            },
          ]}
          rows={visibleAttendanceRecords}
          resetPageOnRowsChange={false}
          emptyMessage={t("No attendance records found.")}
          embedded
          pageSize={attendanceView === "current" ? 10 : null}
        />
        {attendanceView !== "current" && attendanceDateKeys.length > 0 ? (
          <div className="table-pagination">
            <span>{t("Page")}{" "}{effectiveAttendanceDatePage}{" "}{t("of")}{" "}{attendanceDatePageCount}
            </span>
            <div className="table-pagination-actions">
              <button
                type="button"
                className="table-action-button table-action-button-muted"
                disabled={effectiveAttendanceDatePage === 1}
                onClick={() => setAttendanceDatePage((current) => Math.max(1, current - 1))}
              >{t("Newer day")}{" "}</button>
              <button
                type="button"
                className="table-action-button"
                disabled={effectiveAttendanceDatePage === attendanceDatePageCount}
                onClick={() => setAttendanceDatePage((current) => Math.min(attendanceDatePageCount, current + 1))}
              >{t("Older day")}{" "}</button>
            </div>
          </div>
        ) : null}
      </section>

      {isManualAttendancePanelOpen ? (
        <FloatingPanel
          eyebrow={t("Attendance")}
          title={t("Manual attendance")}
          titleId="manual-attendance-title"
          onClose={() => setIsManualAttendancePanelOpen(false)}
        >
          <form className="floating-panel-form" onSubmit={handleManualAttendanceSubmit}>
            <label className="field">
              <span>{t("Type")}</span>
              <select
                value={manualAttendanceForm.event_type}
                required
                onChange={(event) =>
                  setManualAttendanceForm((current) => ({
                    ...current,
                    event_type: event.target.value,
                  }))
                }
              >
                <option value="CHECK_IN">{t("Check-in")}</option>
                <option value="CHECK_OUT">{t("Checkout")}</option>
              </select>
            </label>

            <label className="field">
              <span>{t("Teacher")}</span>
              <select
                value={manualAttendanceForm.teacher_id}
                required
                onChange={(event) =>
                  setManualAttendanceForm((current) => ({
                    ...current,
                    teacher_id: event.target.value,
                  }))
                }
              >
                {teachers.map((teacher) => (
                  <option key={teacher.teacher_id} value={teacher.teacher_id}>
                    {teacher.user_code ? `${teacher.user_code} - ` : ""}{teacher.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>{t("Center")}</span>
              <select
                value={manualAttendanceForm.center_id}
                required
                onChange={(event) =>
                  setManualAttendanceForm((current) => ({
                    ...current,
                    center_id: event.target.value,
                  }))
                }
              >
                {centers.map((center) => (
                  <option key={center.center_id} value={center.center_id}>
                    {center.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="floating-panel-grid">
              <label className="field">
                <span>{t("Date")}</span>
                <input
                  type="date"
                  value={manualAttendanceForm.checked_date}
                  required
                  onChange={(event) =>
                    setManualAttendanceForm((current) => ({
                      ...current,
                      checked_date: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="field">
                <span>{manualAttendanceForm.event_type === "CHECK_OUT" ? t("Checkout time") : t("Check-in time")}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="HH:MM"
                  pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                  title={t("Use 24-hour time, HH:MM from 00:00 to 23:59")}
                  maxLength="5"
                  value={manualAttendanceForm.checked_time}
                  required
                  onChange={(event) =>
                    setManualAttendanceForm((current) => ({
                      ...current,
                      checked_time: formatTimeDraft(event.target.value),
                    }))
                  }
                />
              </label>
            </div>

            <div className="floating-panel-summary">
              <div className="floating-panel-summary-row">
                <span>{t("Status")}</span>
                <StatusPill value={t("MANUAL")} />
              </div>
            </div>

            <div className="floating-panel-actions">
              <button
                type="submit"
                className="table-action-button"
                disabled={
                  pendingAction === "manual-attendance" ||
                  teachers.length === 0 ||
                  centers.length === 0 ||
                  !manualAttendanceForm.teacher_id ||
                  !manualAttendanceForm.center_id
                }
              >
                {pendingAction === "manual-attendance"
                  ? t("Saving...")
                  : t("Save manual {p0}", { p0: t(manualAttendanceForm.event_type === "CHECK_OUT" ? "Checkout" : "Check-in") })}
              </button>
              <button
                type="button"
                className="table-action-button table-action-button-muted"
                onClick={() => setIsManualAttendancePanelOpen(false)}
              >{t("Cancel")}{" "}</button>
            </div>
          </form>
        </FloatingPanel>
      ) : null}

      {isAttendanceExportPanelOpen ? <AttendanceReportPanel apiBase={apiBase} token={token} teachers={teachers} onClose={() => setIsAttendanceExportPanelOpen(false)} /> : null}

      {selectedClassTime ? (
        <FloatingPanel
          eyebrow={t("Class Time")}
          title={`${selectedClassTime.center_label || selectedClassTime.center_id} | ${formatAttendanceDayCode(selectedClassTime.day_of_week, language)}`}
          titleId="class-time-edit-title"
          onClose={() => setSelectedClassTime(null)}
        >
          <form className="floating-panel-form" onSubmit={handleClassTimeSubmit}>
            <div className="floating-panel-grid">
              <div>
                <p className="subtle">{t("Status")}</p>
                <StatusPill value={selectedClassTime.status} />
              </div>
              <div>
                <p className="subtle">{t("Teachers")}</p>
                <strong>{selectedClassTime.teacher_count || selectedClassTime.teacher_ids?.length || 0}/2</strong>
              </div>
            </div>

            <label className="field">
              <span>{t("Start Time")}</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="HH:MM"
                pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                title={t("Use 24-hour time, HH:MM from 00:00 to 23:59")}
                maxLength="5"
                value={classTimeForm.start_time}
                required
                onChange={(event) =>
                  setClassTimeForm((current) => ({
                    ...current,
                    start_time: formatTimeDraft(event.target.value),
                  }))
                }
              />
            </label>

            <label className="field">
              <span>{t("End Time")}</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="HH:MM"
                pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                title={t("Use 24-hour time, HH:MM from 00:00 to 23:59")}
                maxLength="5"
                value={classTimeForm.end_time}
                required
                onChange={(event) =>
                  setClassTimeForm((current) => ({
                    ...current,
                    end_time: formatTimeDraft(event.target.value),
                  }))
                }
              />
            </label>

            <div className="floating-panel-actions">
              <button
                type="submit"
                className="table-action-button"
                disabled={pendingAction === `class-time-${selectedClassTime.class_id}`}
              >
                {pendingAction === `class-time-${selectedClassTime.class_id}` ? t("Saving...") : t("Save time")}
              </button>
              <button
                type="button"
                className="table-action-button table-action-button-muted"
                onClick={() => setSelectedClassTime(null)}
              >{t("Cancel")}{" "}</button>
            </div>
          </form>
        </FloatingPanel>
      ) : null}

      <section className="dashboard-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">{t("Resources")}</p>
            <h2>{resourceView === "teachers" ? t("Teachers") : t("Classes by center")}</h2>
          </div>
          <div className="section-toggle-group" role="tablist" aria-label={t("Resource view")}>
            <button
              type="button"
              className={`section-toggle-button ${resourceView === "teachers" ? "active" : ""}`.trim()}
              onClick={() => setResourceView("teachers")}
            >{t("Teachers")}{" "}</button>
            <button
              type="button"
              className={`section-toggle-button ${resourceView === "classes" ? "active" : ""}`.trim()}
              onClick={() => setResourceView("classes")}
            >{t("Classes")}{" "}</button>
          </div>
        </div>

        {resourceView === "teachers" ? (
          <DataTable
          title={t("Teachers")}
          columns={[
            {
              key: "avatar",
              label: t("Avatar"),
              render: (row) => (
                <button
                  type="button"
                  className="avatar-preview-button"
                  onClick={() => setSelectedAvatarTeacher(row)}
                  aria-label={t("View avatar for {p0}", { p0: row.name })}
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
            { key: "user_code", label: t("User Code") },
            {
              key: "name",
              label: t("Name"),
              render: (row) => (
                <button type="button" className="teacher-name-button" onClick={() => setSelectedTeacherDetail(row)}>
                  {formatValue(row.name)}
                </button>
              ),
            },
            { key: "contact", label: t("Phone") },
            { key: "email", label: t("Email") },
            {
              key: "elo",
              label: <span className="table-value-center">{t("ELO")}</span>,
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
              label: <span className="table-value-center">{t("Education")}</span>,
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
              label: <span className="table-value-center">{t("Max Slots")}</span>,
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
              label: t("Monthly Score"),
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
              label: t("Active"),
              render: (row) => (
                <select
                  className={`table-select ${row.active ? "table-select-active" : "table-select-inactive"}`}
                  value={row.active ? "yes" : "no"}
                  disabled={pendingAction === `teacher-active-${row.teacher_id}`}
                  onChange={(event) => onUpdateTeacherActive(row.teacher_id, event.target.value === "yes")}
                >
                  <option value="yes">{t("Yes")}</option>
                  <option value="no">{t("No")}</option>
                </select>
              ),
            },
          ]}
          rows={teachers}
          emptyMessage={t("No teachers found.")}
          embedded
          pageSize={10}
        />
        ) : replacementQueue.length === 0 ? (
          <p className="subtle">{t("No classes found.")}</p>
        ) : (
          <div className="center-class-group">
            <div className="center-class-head">
              <div>
                <h3>{currentAssignmentCenterLabel}</h3>
                <span className="subtle">{currentAssignmentClasses.length}{" "}{t("classes")}</span>
              </div>
              <span className="subtle">{t("Center")}{" "}{assignmentCenterPage}{" "}{t("of")}{" "}{assignmentCenterPageCount}
              </span>
            </div>

            <div className="class-week-grid assignment-week-grid" role="table" aria-label={t("{p0} assignment queue by weekday", { p0: currentAssignmentCenterLabel })}>
              {CLASS_DAYS.map((day) => {
                const dayClasses = currentAssignmentClasses
                  .filter((item) => item.day_of_week === day)
                  .sort((left, right) => String(left.start_time).localeCompare(String(right.start_time)));

                return (
                  <div className="class-week-column" role="cell" key={`${currentAssignmentCenterLabel}-${day}`}>
                    <div className="class-week-day">{formatAttendanceDayCode(day, language)}</div>
                    <div className="class-week-list">
                      {dayClasses.length === 0 ? (
                        <span className="class-week-empty">{t("No classes")}</span>
                      ) : (
                        dayClasses.map((item) => {
                          const teacherCount = item.teacher_count || item.teacher_ids?.length || (item.teacher_id ? 1 : 0);
                          const canAssignMoreTeachers = teacherCount < 2 && item.status !== "CANCELLED";

                          return (
                            <article className="class-week-item assignment-week-item" key={item.class_id}>
                              <div className="class-week-item-head">
                                <StatusPill value={item.status} />
                                <span className="subtle">{teacherCount}/2</span>
                              </div>
                              <button
                                type="button"
                                className="class-time-button"
                                onClick={() => openClassTimePanel(item)}
                                title={t("Edit class time")}
                              >
                                {formatTimeValue(item.start_time)} - {formatTimeValue(item.end_time)}
                              </button>
                              {renderTeacherNames(t, item.teacher_label, item.teacher_ids, getClassTeacherModes(item), item.original_teacher_ids, (teacherId, teacherName, assignmentMode, originalTeacherId) =>
                                openClassTeacherPanel(item, teacherId, teacherName, assignmentMode, originalTeacherId),
                              )}
                              {(item.temporary_assignments || []).map((assignment) => (
                                <button type="button" className="class-teacher-button temporary"
                                  key={`${assignment.original_teacher_id}-${assignment.effective_date}`}
                                  onClick={() => openClassTeacherPanel(item, assignment.teacher_id, assignment.teacher_name, "TEMPORARY", assignment.original_teacher_id, assignment.effective_date)}>
                                  {assignment.teacher_name} · {t("Teaching replacement date")} {formatAttendanceDate(assignment.effective_date)}
                                </button>
                              ))}
                              {canAssignMoreTeachers ? (
                                <button
                                  type="button"
                                  className="table-action-button assignment-load-button"
                                  disabled={pendingAction === `suggest-${item.class_id}`}
                                  onClick={() => openSuggestionPanel(item)}
                                >
                                  {pendingAction === `suggest-${item.class_id}` ? t("Loading...") : t("Load suggestions")}
                                </button>
                              ) : null}
                            </article>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="table-pagination class-center-pagination">
              <span>
                {currentAssignmentCenterLabel} | {assignmentCenterPage}{" "}{t("of")}{" "}{assignmentCenterPageCount}
              </span>
              <div className="table-pagination-actions">
                <button
                  type="button"
                  className="table-action-button table-action-button-muted"
                  disabled={assignmentCenterPage === 1}
                  onClick={() => setAssignmentCenterPage((current) => Math.max(1, current - 1))}
                >{t("Previous center")}{" "}</button>
                <button
                  type="button"
                  className="table-action-button"
                  disabled={assignmentCenterPage === assignmentCenterPageCount}
                  onClick={() => setAssignmentCenterPage((current) => Math.min(assignmentCenterPageCount, current + 1))}
                >{t("Next center")}{" "}</button>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="dashboard-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">{t("Requests")}</p>
            <h2>{requestView === "leave" ? t("Leave Requests") : t("Password Reset Requests")}</h2>
          </div>
          <div className="section-toggle-group" role="tablist" aria-label={t("Request view")}>
            <button
              type="button"
              className={`section-toggle-button ${requestView === "leave" ? "active" : ""}`.trim()}
              onClick={() => setRequestView("leave")}
            >{t("Leave")}{" "}</button>
            <button
              type="button"
              className={`section-toggle-button ${requestView === "password" ? "active" : ""}`.trim()}
              onClick={() => setRequestView("password")}
            >{t("Password Change")}{" "}</button>
          </div>
        </div>

        {requestView === "leave" ? (
          <>
            <div className="table-filter-row">
              <div className="section-toggle-group" role="tablist" aria-label={t("Leave request filter")}>
                <button
                  type="button"
                  className={`section-toggle-button ${leaveRequestView === "active" ? "active" : ""}`.trim()}
                  onClick={() => setLeaveRequestView("active")}
                >{t("Active")}{" "}</button>
                <button
                  type="button"
                  className={`section-toggle-button ${leaveRequestView === "history" ? "active" : ""}`.trim()}
                  onClick={() => setLeaveRequestView("history")}
                >{t("History")}{" "}</button>
                <button
                  type="button"
                  className={`section-toggle-button ${leaveRequestView === "all" ? "active" : ""}`.trim()}
                  onClick={() => setLeaveRequestView("all")}
                >{t("All")}{" "}</button>
              </div>
            </div>
          <DataTable
            title={t("Leave Requests")}
            columns={[
              { key: "request_id", label: t("Request ID") },
              { key: "class_id", label: t("Class ID") },
              { key: "center_id", label: t("Center") },
              { key: "teacher_name", label: t("Teacher") },
              { key: "assigned_manager_name", label: t("Assigned Manager") },
              { key: "class_day_of_week", label: t("Class Day"), render: (row) => formatAttendanceDayCode(row.class_day_of_week, language) },
              { key: "request_date", label: t("Request Date") },
              { key: "status", label: t("Status"), render: (row) => <StatusPill value={row.status} /> },
              {
                key: "info",
                label: t("Info"),
                render: (row) => (
                  <button
                    type="button"
                    className="table-action-button table-action-button-muted"
                    onClick={() => setSelectedLeaveRequest(row)}
                  >{t("Show")}{" "}</button>
                ),
              },
            ]}
            rows={visibleLeaveRequests}
            emptyMessage={t("No leave requests found.")}
            embedded
          />
          </>
        ) : (
          <DataTable
            title={t("Password Reset Requests")}
            columns={[
              { key: "user_code", label: t("User Code") },
              {
                key: "display_name",
                label: t("Display Name"),
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
              { key: "created_at", label: t("Created") },
              { key: "status", label: t("Status"), render: (row) => <StatusPill value={row.status} /> },
              { key: "request_note", label: t("Note"), render: (row) => formatValue(row.request_note) },
              {
                key: "actions",
                label: t("Actions"),
                render: (row) => (
                  <div className="table-actions">
                    {row.status === "REQUESTED" ? (
                      <>
                        <button
                          type="button"
                          className="table-action-button"
                          disabled={pendingAction === `reset-request-${row.request_id}`}
                          onClick={() => onResetPasswordRequest(row.request_id)}
                        >{t("Reset to default")}{" "}</button>
                      </>
                    ) : (
                      <span className="subtle">{t("Processed")}</span>
                    )}
                  </div>
                ),
              },
            ]}
            rows={resetRequests}
            emptyMessage={t("No password reset requests found.")}
            embedded
          />
        )}
      </section>

      {selectedClassTeacher ? (
        <FloatingPanel
          eyebrow={t("Class Teacher")}
          title={selectedClassTeacher.teacherName}
          titleId="class-teacher-action-title"
          onClose={() => {
            setSelectedClassTeacher(null);
            setClassTeacherAction("manage");
            setClassTeacherSuggestions([]);
            setSelectedReassignTeacherId("");
            setSelectedReassignMode("TEMPORARY");
          }}
        >
          <div className="floating-panel-grid">
            <div>
              <p className="subtle">{t("Class")}</p>
              <strong>{formatAttendanceDayCode(selectedClassTeacher.classItem.day_of_week, language)}</strong>
            </div>
            <div>
              <p className="subtle">{t("Time")}</p>
              <strong>
                {formatTimeValue(selectedClassTeacher.classItem.start_time)} - {formatTimeValue(selectedClassTeacher.classItem.end_time)}
              </strong>
            </div>
            <div>
              <p className="subtle">{t("Center")}</p>
              <strong>{formatValue(selectedClassTeacher.classItem.center_label)}</strong>
            </div>
            <div>
              <p className="subtle">{t("Teacher")}</p>
              <strong>{selectedClassTeacher.teacherName}</strong>
              <p className={`subtle assignment-type-label ${selectedClassTeacher.assignmentMode === "TEMPORARY" ? "temporary" : ""}`}>{t("Current assignment:")}{" "}{selectedClassTeacher.assignmentMode === "TEMPORARY" ? t("Temporary") : t("Permanent")}
              </p>
            </div>
          </div>

          {classTeacherAction === "reassign" ? (
            <div className="floating-panel-section">
              <div className="field">
                <span>{t("Reassign mode")}</span>
                <div className="reassign-mode-grid" role="group" aria-label={t("Reassign mode")}>
                  {REASSIGNMENT_MODES.map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      className={`reassign-mode-option${selectedReassignMode === mode.value ? " selected" : ""}`}
                      onClick={() => setSelectedReassignMode(mode.value)}
                    >
                      <strong>{t(mode.title)}</strong>
                      <span>{t(mode.description)}</span>
                    </button>
                  ))}
                </div>
              </div>
              {selectedReassignMode === "TEMPORARY" ? (
                <div className="field">
                  <span>{t("Teaching replacement date")}: {formatAttendanceDate(selectedReassignDate)}</span>
                  <button type="button" className="inline-text-action" onClick={() => setShowReassignDates((value) => !value)}>{t("Change date")}</button>
                  {showReassignDates ? (
                    <select aria-label={t("Teaching replacement date")} value={selectedReassignDate} onChange={(event) => setSelectedReassignDate(event.target.value)}>
                      {upcomingTeachingDates(selectedClassTeacher.classItem.day_of_week).map((date) => <option key={date} value={date}>{formatAttendanceWeekday(date, language)} - {formatAttendanceDate(date)}</option>)}
                    </select>
                  ) : null}
                </div>
              ) : null}
              <label className="field">
                <span>{t("Reassign to")}</span>
                <select
                  value={selectedReassignTeacherId}
                  onChange={(event) => setSelectedReassignTeacherId(event.target.value)}
                >
                  {classTeacherSuggestions.map((suggestion) => (
                    <option key={suggestion.teacher_id} value={suggestion.teacher_id}>
                      {suggestion.name}
                    </option>
                  ))}
                </select>
              </label>
              {classTeacherSuggestions.length === 0 ? (
                <p className="subtle">{t("No eligible teachers found for this class.")}</p>
              ) : null}
            </div>
          ) : null}

          <div className="floating-panel-actions">
            {classTeacherAction === "manage" ? (
              <>
                {selectedClassTeacher.assignmentMode === "TEMPORARY" ? (
                  <>
                    <p className="subtle floating-panel-action-note">{t("For the selected teaching date only.")}</p>
                    <button
                      type="button"
                      className="table-action-button table-action-button-muted"
                      disabled={
                        pendingAction === `class-teacher-restore-${selectedClassTeacher.classItem.class_id}-${selectedClassTeacher.originalTeacherId || selectedClassTeacher.teacherId}`
                      }
                      onClick={handleRestorePermanentClassTeacher}
                    >
                      {pendingAction === `class-teacher-restore-${selectedClassTeacher.classItem.class_id}-${selectedClassTeacher.originalTeacherId || selectedClassTeacher.teacherId}`
                        ? t("Restoring...")
                        : t("Restore permanent")}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="table-action-button table-action-button-muted"
                    disabled={pendingAction === `class-teacher-remove-${selectedClassTeacher.classItem.class_id}-${selectedClassTeacher.teacherId}`}
                    onClick={handleRemoveClassTeacher}
                  >
                    {pendingAction === `class-teacher-remove-${selectedClassTeacher.classItem.class_id}-${selectedClassTeacher.teacherId}` ? t("Removing...") : t("Remove")}
                  </button>
                )}
                <button type="button" className="table-action-button" onClick={openReassignClassTeacher}>{t("Reassign")}{" "}</button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="table-action-button"
                  disabled={
                    !selectedReassignTeacherId ||
                    pendingAction === `class-teacher-reassign-${selectedClassTeacher.classItem.class_id}-${selectedClassTeacher.originalTeacherId || selectedClassTeacher.teacherId}`
                  }
                  onClick={handleReassignClassTeacher}
                >
                  {pendingAction === `class-teacher-reassign-${selectedClassTeacher.classItem.class_id}-${selectedClassTeacher.originalTeacherId || selectedClassTeacher.teacherId}`
                    ? t("Reassigning...")
                    : t("Save reassign")}
                </button>
                <button
                  type="button"
                  className="table-action-button table-action-button-muted"
                  onClick={() => setClassTeacherAction("manage")}
                >{t("Back")}{" "}</button>
              </>
            )}
          </div>
        </FloatingPanel>
      ) : null}

      {selectedSuggestionClass ? (
        <FloatingPanel
          eyebrow={t("Replacement Suggestions")}
          title={`${selectedSuggestionClass.center_label || selectedSuggestionClass.center_id} | ${formatAttendanceDayCode(selectedSuggestionClass.day_of_week, language)} ${formatTimeValue(selectedSuggestionClass.start_time)} - ${formatTimeValue(selectedSuggestionClass.end_time)}`}
          titleId="replacement-suggestions-title"
          onClose={() => {
            setSelectedSuggestionClass(null);
            setSelectedSuggestionTeacherIds([]);
          }}
        >
          <div className="floating-panel-section">
            <div className="replacement-selection-summary">
              <span className="subtle">{t("Select up to")}{" "}{selectedClassAvailableTeacherSlots}{" "}{t("teachers")}</span>
              <strong>{selectedSuggestionTeacherIds.length}/{selectedClassAvailableTeacherSlots}{" "}{t("selected")}</strong>
            </div>
          </div>

          {selectedClassSuggestions.length === 0 ? (
            <p className="subtle">{t("No eligible teachers found.")}</p>
          ) : (
            <div className="replacement-suggestions replacement-panel-suggestions">
              {selectedClassSuggestions.map((suggestion) => {
                const isSelected = selectedSuggestionTeacherIds.includes(suggestion.teacher_id);
                const isSelectionFull = selectedSuggestionTeacherIds.length >= selectedClassAvailableTeacherSlots && !isSelected;

                return (
                  <div key={`${selectedSuggestionClass.class_id}-${suggestion.teacher_id}`} className="replacement-suggestion-row replacement-panel-row">
                    <div className="suggestion-choice">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isSelectionFull}
                        onChange={() => toggleSuggestionTeacher(suggestion.teacher_id)}
                      />
                      <span className="replacement-suggestion-meta">
                        <button
                          type="button"
                          className="suggestion-teacher-button"
                          onClick={(event) => {
                            setSelectedSuggestionTeacher(
                              teachersById.get(suggestion.teacher_id) || {
                                teacher_id: suggestion.teacher_id,
                                name: suggestion.name,
                                contact: "",
                                email: "",
                                elo: suggestion.elo,
                                education_score: suggestion.education_score,
                              },
                            );
                          }}
                        >
                          {suggestion.teacher_id} - {suggestion.name}
                        </button>
                        <span className="subtle">{t("Final")}{" "}{suggestion.final_score.toFixed(4)}{" "}{t("| ELO")}{" "}{suggestion.normalized_score.toFixed(4)}{" "}{t("| Education")}{" "}{suggestion.normalized_education_score.toFixed(4)}
                        </span>
                        <span className="subtle">{t("Center match")}{" "}{suggestion.center_match ? t("Yes") : t("No")}{" "}{t("| Time match")}{" "}{suggestion.time_match ? t("Yes") : t("No")}
                        </span>
                        <span className="subtle">{t("Slots")}{" "}{suggestion.assigned_slots_that_day}/{suggestion.max_slots_per_day}
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="floating-panel-actions">
            <button
              type="button"
              className="table-action-button"
              disabled={selectedSuggestionTeacherIds.length === 0 || pendingAction.startsWith(`assign-${selectedSuggestionClass.class_id}-`)}
              onClick={assignSelectedSuggestions}
            >
              {pendingAction.startsWith(`assign-${selectedSuggestionClass.class_id}-`) ? t("Assigning...") : t("Assign selected")}
            </button>
          </div>
        </FloatingPanel>
      ) : null}

      {selectedLeaveRequest ? (
        <FloatingPanel
          eyebrow={t("Leave Request")}
          title={selectedLeaveRequest.request_id}
          titleId="leave-request-info-title"
          onClose={() => setSelectedLeaveRequest(null)}
        >
                <div className="floating-panel-grid">
                  <div>
                    <p className="subtle">{t("Teacher")}</p>
                    <strong>{formatValue(selectedLeaveRequest.teacher_name)}</strong>
                  </div>
                  <div>
                    <p className="subtle">{t("Class")}</p>
                    <strong>{formatValue(selectedLeaveRequest.class_id)}</strong>
                  </div>
                  <div>
                    <p className="subtle">{t("Center")}</p>
                    <strong>{formatValue(selectedLeaveRequest.center_id)}</strong>
                  </div>
                  <div>
                    <p className="subtle">{t("Class Day")}</p>
                    <strong>{formatAttendanceDayCode(selectedLeaveRequest.class_day_of_week, language)}</strong>
                  </div>
                  <div>
                    <p className="subtle">{t("Request Date")}</p>
                    <strong>{formatValue(selectedLeaveRequest.request_date)}</strong>
                  </div>
                </div>

                <div className="floating-panel-section">
                  <p className="subtle">{t("Reason")}</p>
                  <div className="floating-panel-reason-box">
                    <p>{formatValue(selectedLeaveRequest.reason)}</p>
                  </div>
                </div>

                <div className="floating-panel-section floating-panel-status-row">
                  <p className="subtle">{t("Status")}</p>
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
                      {pendingAction === `approve-${selectedLeaveRequest.request_id}` ? t("Approving...") : t("Approve")}
                    </button>
                  ) : null}
                  {selectedLeaveRequest.status === "REQUESTED" ? (
                    <button
                      type="button"
                      className="table-action-button table-action-button-muted"
                      disabled={pendingAction === `reject-${selectedLeaveRequest.request_id}`}
                      onClick={() => onRejectLeaveRequest(selectedLeaveRequest.request_id)}
                    >
                      {pendingAction === `reject-${selectedLeaveRequest.request_id}` ? t("Rejecting...") : t("Reject")}
                    </button>
                  ) : null}
                </div>
        </FloatingPanel>
      ) : null}

      {selectedSuggestionTeacher ? (
        <FloatingPanel
          eyebrow={t("Teacher Contact")}
          title={`${selectedSuggestionTeacher.teacher_id} - ${selectedSuggestionTeacher.name}`}
          titleId="suggestion-teacher-title"
          onClose={() => setSelectedSuggestionTeacher(null)}
        >
                <div className="floating-panel-grid">
                  <div>
                    <p className="subtle">{t("Phone")}</p>
                    <strong>{formatValue(selectedSuggestionTeacher.contact)}</strong>
                  </div>
                  <div>
                    <p className="subtle">{t("Personal Email")}</p>
                    <strong>{formatValue(selectedSuggestionTeacher.email)}</strong>
                  </div>
                  <div>
                    <p className="subtle">{t("ELO")}</p>
                    <strong>{formatValue(selectedSuggestionTeacher.elo)}</strong>
                  </div>
                  <div>
                    <p className="subtle">{t("Education Score")}</p>
                    <strong>{formatValue(selectedSuggestionTeacher.education_score)}</strong>
                  </div>
                </div>
        </FloatingPanel>
      ) : null}

      {selectedAvatarTeacher ? (
        <FloatingPanel
          eyebrow={t("Teacher Avatar")}
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
                  {pendingAction === `teacher-avatar-delete-${selectedAvatarTeacher.teacher_id}` ? t("Deleting...") : t("Delete")}
                </button>
              ) : null}
            </div>
            <div className="teacher-avatar-verification-copy">
              <p className="subtle">{t("Teacher ID")}</p>
              <strong>{formatValue(selectedAvatarTeacher.teacher_id)}</strong>
              <p className="subtle">{t("Name")}</p>
              <strong>{formatValue(selectedAvatarTeacher.name)}</strong>
            </div>
          </div>
        </FloatingPanel>
      ) : null}

      {selectedTeacherDetail ? (
        <FloatingPanel
          eyebrow={t("Teacher Detail")}
          title={`${selectedTeacherDetail.user_code || selectedTeacherDetail.teacher_id} - ${selectedTeacherDetail.name}`}
          titleId="teacher-detail-title"
          onClose={() => setSelectedTeacherDetail(null)}
        >
          <div className="teacher-detail-head">
            <UserAvatar
              apiBase={apiBase}
              imageUrl={selectedTeacherDetail.profile_image_url}
              name={selectedTeacherDetail.name}
              fallbackCode={selectedTeacherDetail.teacher_id}
              size="medium"
            />
            <div>
              <strong>{formatValue(selectedTeacherDetail.name)}</strong>
              <p className="subtle">{formatValue(selectedTeacherDetail.email)}</p>
            </div>
          </div>

          <div className="floating-panel-grid score-summary-grid">
            <div>
              <p className="subtle">{t("Assigned Classes")}</p>
              <strong>{selectedTeacherAssignedClasses.length}</strong>
            </div>
            <div>
              <p className="subtle">{t("Today Classes")}</p>
              <strong>{selectedTeacherTodayRows.length}</strong>
            </div>
            <div>
              <p className="subtle">{t("Checked In Today")}</p>
              <strong>{selectedTeacherTodayRows.filter((item) => item.checked_at).length}</strong>
            </div>
            <div>
              <p className="subtle">{t("Checked Out Today")}</p>
              <strong>{selectedTeacherTodayRows.filter((item) => item.check_out_at).length}</strong>
            </div>
          </div>

          <div className="floating-panel-section">
            <p className="subtle">{t("Today attendance status")}</p>
            {selectedTeacherTodayRows.length === 0 ? (
              <p className="subtle">{t("No classes scheduled today.")}</p>
            ) : (
              <div className="teacher-detail-session-list">
                {selectedTeacherTodayRows.map((item) => (
                  <article className="teacher-detail-session" key={`${item.class_id}-${item.teacher_id}`}>
                    <div>
                      <strong>
                        {formatTimeValue(item.start_time)} - {formatTimeValue(item.end_time)}
                      </strong>
                      <span>{formatValue(item.nearest_center_name)}</span>
                    </div>
                    <div className="teacher-detail-session-status-grid">
                      <div className="teacher-detail-session-status">
                        <span className="subtle">{t("Check-in")}</span>
                        <StatusPill value={item.attendance_status || "PENDING"} />
                        <span className="subtle">{formatAttendanceTime(item.checked_at)}</span>
                      </div>
                      <div className="teacher-detail-session-status">
                        <span className="subtle">{t("Checkout")}</span>
                        <StatusPill value={item.checkout_status || "-"} />
                        <span className="subtle">{formatAttendanceTime(item.check_out_at)}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </FloatingPanel>
      ) : null}

      {selectedProfileEdit ? (
        <FloatingPanel
          eyebrow={t("Teacher Profile")}
          title={`${profileEditMeta[selectedProfileEdit.field].label} | ${selectedProfileEdit.teacher.teacher_id} - ${selectedProfileEdit.teacher.name}`}
          titleId="teacher-profile-edit-title"
          onClose={() => setSelectedProfileEdit(null)}
        >
          <div className="floating-panel-grid score-summary-grid">
            <div>
              <p className="subtle">{t("Current")}{" "}{profileEditMeta[selectedProfileEdit.field].label}</p>
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
              {pendingAction === `teacher-profile-${selectedProfileEdit.teacher.teacher_id}` ? t("Saving...") : t("Save")}
            </button>
          </form>

          <div className={`status score-panel-status ${profilePanelStatus.kind}`.trim()}>{t(profilePanelStatus.message)}</div>
        </FloatingPanel>
      ) : null}

      {selectedScoreTeacher ? (
        <FloatingPanel
          eyebrow={t("Teacher Score")}
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
                    <p className="subtle">{t("Monthly Score")}</p>
                    <strong>{score.score}/{score.max_score}</strong>
                  </div>
                  <div>
                    <p className="subtle">{t("Events")}</p>
                    <strong>{score.event_count}</strong>
                  </div>
                </div>

                <form className="auth-form compact score-panel-form" onSubmit={handleScoreSubmit} noValidate>
                  <label className="field">
                    <span>{t("Delta")}</span>
                    <input
                      value={scoreForm.delta}
                      onChange={(event) => setScoreForm((current) => ({ ...current, delta: event.target.value }))}
                      type="number"
                      placeholder={t("-5 or 3")}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>{t("Reason")}</span>
                    <input
                      value={scoreForm.reason}
                      onChange={(event) => setScoreForm((current) => ({ ...current, reason: event.target.value }))}
                      type="text"
                      required
                    />
                  </label>
                  <label className="field">
                    <span>{t("Evidence Text")}</span>
                    <textarea
                      value={scoreForm.evidence_text}
                      onChange={(event) => setScoreForm((current) => ({ ...current, evidence_text: event.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span>{t("Evidence URL")}</span>
                    <input
                      value={scoreForm.evidence_url}
                      onChange={(event) => setScoreForm((current) => ({ ...current, evidence_url: event.target.value }))}
                      type="url"
                    />
                  </label>
                  <button className="table-action-button" type="submit" disabled={pendingAction === `score-${selectedScoreTeacher.teacher_id}`}>
                    {pendingAction === `score-${selectedScoreTeacher.teacher_id}` ? t("Saving...") : t("Save score event")}
                  </button>
                </form>

                <div className={`status score-panel-status ${scorePanelStatus.kind || actionStatus.kind}`.trim()} role="status" aria-live="polite">
                  {t(scorePanelStatus.message || (actionStatus.kind === "error" ? actionStatus.message : ""))}
                </div>

                <div className="floating-panel-section score-history-section">
                  <button type="button" className="score-history-toggle" onClick={toggleScoreHistory}>
                    {isScoreHistoryVisible ? t("Hide Score History") : t("Show Score History")}
                  </button>
                  {isScoreHistoryVisible ? (
                    isScoreEventsLoading ? (
                      <p className="subtle">{t("Loading score events...")}</p>
                    ) : scoreEvents.length === 0 ? (
                      <p className="subtle">{t("No score events this month.")}</p>
                    ) : (
                      <div className="score-event-list">
                        {scoreEvents.map((item) => (
                          <article className="score-event-item" key={item.event_id}>
                            <strong>{item.delta > 0 ? "+" : ""}{item.delta}{" "}{t("points")}</strong>
                            <span>{formatDateTimeValue(item.created_at, language)}</span>
                            <p>{item.reason}</p>
                            <p className="subtle">{item.evidence_text}</p>
                            {item.evidence_url ? (
                              <a className="inline-link" href={item.evidence_url} target="_blank" rel="noreferrer">{t("View evidence")}{" "}</a>
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
          title={t("Managers")}
          columns={[
            { key: "user_code", label: t("User Code") },
            {
              key: "display_name",
              label: t("Display Name"),
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
            { key: "role", label: t("Role"), render: (row) => getRoleTitle(row.role, t) },
            { key: "teacher_id", label: t("Teacher ID") },
          ]}
          rows={managerUsers}
          emptyMessage={t("No manager accounts found.")}
        />
      ) : null}
    </>
  );
}

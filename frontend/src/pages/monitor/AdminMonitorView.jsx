import { useEffect, useState } from "react";

import UserAvatar from "../../components/UserAvatar.jsx";
import BackupManagement from "./BackupManagement.jsx";
import DataTable from "./DataTable.jsx";
import FloatingPanel from "./FloatingPanel.jsx";
import StatusPill from "./StatusPill.jsx";
import { formatClockTimeValue, formatDateTimeValue, formatTimeDraft, formatTimeValue, formatValue } from "./monitorUtils.js";

const ACTIVE_LEAVE_STATUSES = new Set(["REQUESTED", "APPROVED"]);
const HISTORY_LEAVE_STATUSES = new Set(["CANCELLED", "REJECTED"]);
const CLASS_DAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const WEEKDAY_BY_INDEX = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const REASSIGNMENT_MODES = [
  {
    value: "TEMPORARY",
    title: "Temporary",
    description: "Today only. The class returns to the original teacher tomorrow.",
  },
  {
    value: "PERMANENT",
    title: "Permanent",
    description: "Replace the fixed assignment for all future days.",
  },
];

function getDatetimeLocalValue(date = new Date()) {
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localTime.toISOString().slice(0, 16);
}

function getLocalDateKey(date = new Date()) {
  return getDatetimeLocalValue(date).slice(0, 10);
}

function getPreviousMonthDateRange(date = new Date()) {
  const startDate = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  const endDate = new Date(date.getFullYear(), date.getMonth(), 0);

  return {
    start_date: getLocalDateKey(startDate),
    end_date: getLocalDateKey(endDate),
  };
}

function getDayCode(date = new Date()) {
  return WEEKDAY_BY_INDEX[date.getDay()];
}

function getTimeMinutes(value) {
  const timeValue = formatTimeValue(value);
  const [hours, minutes] = String(timeValue).split(":").map(Number);
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

function getPreviousDate(date) {
  const previousDate = new Date(date);
  previousDate.setDate(previousDate.getDate() - 1);
  return previousDate;
}

function getAttendanceDateKeys(attendanceRecords, view, currentDate) {
  const todayKey = getLocalDateKey(currentDate);
  const yesterdayKey = getLocalDateKey(getPreviousDate(currentDate));
  const dateKeys = new Set(attendanceRecords.map((record) => getLocalDateKey(new Date(record.checked_at))));

  if (view === "history") {
    dateKeys.delete(todayKey);
    dateKeys.add(yesterdayKey);
  } else {
    dateKeys.add(todayKey);
    dateKeys.add(yesterdayKey);
  }

  return [...dateKeys].sort((left, right) => right.localeCompare(left));
}

function getFallbackAttendanceStatus(classItem, attendanceDate, currentDate = new Date()) {
  if (getLocalDateKey(attendanceDate) < getLocalDateKey(currentDate)) {
    return "MISSED";
  }

  const currentMinutes = currentDate.getHours() * 60 + currentDate.getMinutes();
  const endMinutes = getTimeMinutes(classItem.end_time);

  return currentMinutes > endMinutes ? "MISSED" : "PENDING";
}

function getClassTeacherIds(classItem) {
  return classItem.teacher_ids || (classItem.teacher_id ? [classItem.teacher_id] : []);
}

function getClassTeacherModes(classItem) {
  const teacherIds = getClassTeacherIds(classItem);
  const modes = classItem.teacher_assignment_modes || [];

  return teacherIds.map((_, index) => modes[index] || "PERMANENT");
}

function getCenterSortRank(centerValue = "") {
  const normalized = String(centerValue || "").trim().toUpperCase();
  const match = /^CS(\d+)$/i.exec(normalized);

  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Number.parseInt(match[1], 10);
}

function findContiguousClassForTeacher(classes, classItem, teacherId, direction) {
  return classes.find((item) => {
    if (
      item.class_id === classItem.class_id ||
      item.center_id !== classItem.center_id ||
      item.day_of_week !== classItem.day_of_week ||
      !getClassTeacherIds(item).includes(teacherId)
    ) {
      return false;
    }

    return direction === "previous"
      ? formatTimeValue(item.end_time) === formatTimeValue(classItem.start_time)
      : formatTimeValue(item.start_time) === formatTimeValue(classItem.end_time);
  });
}

function getClassBlockForTeacher(classes, classItem, teacherId) {
  let startClass = classItem;
  let endClass = classItem;
  let previousClass = findContiguousClassForTeacher(classes, startClass, teacherId, "previous");
  let nextClass = findContiguousClassForTeacher(classes, endClass, teacherId, "next");

  while (previousClass) {
    startClass = previousClass;
    previousClass = findContiguousClassForTeacher(classes, startClass, teacherId, "previous");
  }

  while (nextClass) {
    endClass = nextClass;
    nextClass = findContiguousClassForTeacher(classes, endClass, teacherId, "next");
  }

  return { startClass, endClass };
}

function buildAttendanceRowsForDate({ attendanceRecords, classes, teachers, attendanceDate, currentDate = new Date(), view = "current" }) {
  const attendanceDateKey = getLocalDateKey(attendanceDate);
  const attendanceDayCode = getDayCode(attendanceDate);
  const teachersById = new Map(teachers.map((teacher) => [teacher.teacher_id, teacher]));
  const classesById = new Map(classes.map((classItem) => [classItem.class_id, classItem]));
  const latestCheckInByClassTeacher = new Map();
  const latestCheckOutByClassTeacher = new Map();

  attendanceRecords.forEach((record) => {
    if (!record.teacher_id || !record.class_id || getLocalDateKey(new Date(record.checked_at)) !== attendanceDateKey) {
      return;
    }

    const key = `${record.class_id}:${record.teacher_id}`;
    const target = record.event_type === "CHECK_OUT" ? latestCheckOutByClassTeacher : latestCheckInByClassTeacher;
    const current = target.get(key);
    if (!current || new Date(record.checked_at) > new Date(current.checked_at)) {
      target.set(key, record);
    }
  });

  const scheduledRows = classes
    .filter((classItem) => classItem.day_of_week === attendanceDayCode)
    .flatMap((classItem) => {
      const teacherIds = getClassTeacherIds(classItem);

      return teacherIds.map((teacherId) => {
        const teacher = teachersById.get(teacherId) || {};
        const { startClass, endClass } = getClassBlockForTeacher(classes, classItem, teacherId);
        const isBlockStart = classItem.class_id === startClass.class_id;
        const isBlockEnd = classItem.class_id === endClass.class_id;
        const directCheckInRecord = latestCheckInByClassTeacher.get(`${classItem.class_id}:${teacherId}`);
        const directCheckOutRecord = latestCheckOutByClassTeacher.get(`${classItem.class_id}:${teacherId}`);
        const blockStartCheckInRecord = latestCheckInByClassTeacher.get(`${startClass.class_id}:${teacherId}`);
        const blockEndCheckOutRecord = latestCheckOutByClassTeacher.get(`${endClass.class_id}:${teacherId}`);
        const checkInRecord = directCheckInRecord || (!isBlockStart ? blockStartCheckInRecord : null);
        const checkOutRecord = directCheckOutRecord || (!isBlockEnd ? blockEndCheckOutRecord : null);

        return {
          record_id:
            checkInRecord?.record_id ||
            checkOutRecord?.record_id ||
            `attendance-${attendanceDateKey}-${classItem.class_id}-${teacherId}`,
          display_name: teacher.name || checkInRecord?.display_name || checkOutRecord?.display_name || teacherId,
          user_code: teacher.user_code || checkInRecord?.user_code || checkOutRecord?.user_code || "-",
          teacher_id: teacherId,
          class_id: classItem.class_id,
          center_id: classItem.center_id || checkInRecord?.center_id || checkOutRecord?.center_id || "",
          checked_at: checkInRecord?.checked_at || null,
          check_out_at: checkOutRecord?.checked_at || null,
          nearest_center_name: checkInRecord?.nearest_center_name || checkOutRecord?.nearest_center_name || classItem.center_label || classItem.center_id,
          status: checkInRecord?.status || "-",
          attendance_status: checkInRecord
            ? isBlockStart
              ? checkInRecord.attendance_status
              : "COVERED"
            : getFallbackAttendanceStatus(classItem, attendanceDate, currentDate),
          checkout_status: !isBlockEnd && checkInRecord ? "CONTINUED" : checkOutRecord?.attendance_status || (checkInRecord ? "PENDING" : "-"),
          start_time: classItem.start_time,
          end_time: classItem.end_time,
        };
      });
    });

  const groupedHistoricalRows = attendanceRecords
    .filter((record) => record.teacher_id && record.class_id && getLocalDateKey(new Date(record.checked_at)) === attendanceDateKey)
    .reduce((rows, record) => {
      const key = `${record.class_id}:${record.teacher_id}`;
      const existing = rows.get(key) || {
        checkInRecord: null,
        checkOutRecord: null,
      };

      if (record.event_type === "CHECK_IN") {
        if (!existing.checkInRecord || new Date(record.checked_at) > new Date(existing.checkInRecord.checked_at)) {
          existing.checkInRecord = record;
        }
      } else if (record.event_type === "CHECK_OUT") {
        if (!existing.checkOutRecord || new Date(record.checked_at) > new Date(existing.checkOutRecord.checked_at)) {
          existing.checkOutRecord = record;
        }
      }

      rows.set(key, existing);
      return rows;
    }, new Map());

  const rawEventRows = Array.from(groupedHistoricalRows.entries()).map(([key, groupedRecord]) => {
    const [classId, teacherId] = key.split(":");
    const classItem = classesById.get(classId) || null;
    const teacher = teachersById.get(teacherId) || {};
    const checkInRecord = groupedRecord.checkInRecord;
    const checkOutRecord = groupedRecord.checkOutRecord;

    return {
      record_id: checkInRecord?.record_id || checkOutRecord?.record_id || `attendance-${attendanceDateKey}-${classId}-${teacherId}`,
      display_name: teacher.name || checkInRecord?.display_name || checkOutRecord?.display_name || teacherId,
      user_code: teacher.user_code || checkInRecord?.user_code || checkOutRecord?.user_code || "-",
      teacher_id: teacherId,
      class_id: classId,
      center_id: classItem?.center_id || checkInRecord?.center_id || checkOutRecord?.center_id || "",
      checked_at: checkInRecord?.checked_at || null,
      check_out_at: checkOutRecord?.checked_at || null,
      nearest_center_name:
        checkInRecord?.nearest_center_name ||
        checkOutRecord?.nearest_center_name ||
        classItem?.center_label ||
        classItem?.center_id ||
        "-",
      status: checkInRecord?.status || checkOutRecord?.status || "-",
      attendance_status: checkInRecord?.attendance_status || getFallbackAttendanceStatus(classItem || {}, attendanceDate, currentDate),
      checkout_status: checkOutRecord?.attendance_status || (checkInRecord ? "PENDING" : "-"),
      start_time: classItem?.start_time || null,
      end_time: classItem?.end_time || null,
    };
  });

  const scheduledRowKeys = new Set(scheduledRows.map((row) => `${row.class_id}:${row.teacher_id}`));
  const historicalRows = attendanceRecords
    .filter((record) => record.teacher_id && record.class_id && getLocalDateKey(new Date(record.checked_at)) === attendanceDateKey)
    .reduce((rows, record) => {
      const key = `${record.class_id}:${record.teacher_id}`;
      if (scheduledRowKeys.has(key)) {
        return rows;
      }

      const classItem = classesById.get(record.class_id) || null;
      const teacher = teachersById.get(record.teacher_id) || {};
      const checkInRecord = latestCheckInByClassTeacher.get(key);
      const checkOutRecord = latestCheckOutByClassTeacher.get(key);

      rows.push({
        record_id: checkInRecord?.record_id || checkOutRecord?.record_id || record.record_id || `attendance-${attendanceDateKey}-${record.class_id}-${record.teacher_id}`,
        display_name: teacher.name || checkInRecord?.display_name || checkOutRecord?.display_name || record.teacher_id,
        user_code: teacher.user_code || checkInRecord?.user_code || checkOutRecord?.user_code || record.user_code || "-",
        teacher_id: record.teacher_id,
        class_id: record.class_id,
        center_id: classItem?.center_id || checkInRecord?.center_id || checkOutRecord?.center_id || "",
        checked_at: checkInRecord?.checked_at || null,
        check_out_at: checkOutRecord?.checked_at || null,
        nearest_center_name:
          checkInRecord?.nearest_center_name ||
          checkOutRecord?.nearest_center_name ||
          classItem?.center_label ||
          classItem?.center_id ||
          "-",
        status: checkInRecord?.status || "-",
        attendance_status: checkInRecord?.attendance_status || getFallbackAttendanceStatus(classItem || {}, attendanceDate, currentDate),
        checkout_status: checkOutRecord?.attendance_status || (checkInRecord ? "PENDING" : "-"),
        start_time: classItem?.start_time || null,
        end_time: classItem?.end_time || null,
      });

      return rows;
    }, []);

  if (view !== "current") {
    return [...scheduledRows, ...historicalRows].sort((left, right) => {
      const centerCompare = getCenterSortRank(left.center_id || left.nearest_center_name) - getCenterSortRank(right.center_id || right.nearest_center_name);
      if (centerCompare !== 0) {
        return centerCompare;
      }

      const timeCompare = String(left.start_time || "").localeCompare(String(right.start_time || ""));
      if (timeCompare !== 0) {
        return timeCompare;
      }

      return String(left.display_name).localeCompare(String(right.display_name));
    });
  }

  return [...scheduledRows, ...historicalRows].sort((left, right) => {
    const centerCompare = getCenterSortRank(left.center_id || left.nearest_center_name) - getCenterSortRank(right.center_id || right.nearest_center_name);
    if (centerCompare !== 0) {
      return centerCompare;
    }

    const timeCompare = String(left.start_time || "").localeCompare(String(right.start_time || ""));
    if (timeCompare !== 0) {
      return timeCompare;
    }

    return String(left.display_name).localeCompare(String(right.display_name));
  });
}

function renderTeacherNames(label, teacherIds = [], teacherModes = [], originalTeacherIds = [], onSelect = null) {
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
            title={isTemporary ? "Temporary assignment for today" : "Permanent assignment"}
          >
            {item}
          </button>
        );
      })}
    </span>
  );
}

function getDownloadFilename(response, fallback) {
  const contentDisposition = response.headers.get("content-disposition") || "";
  const match = /filename="?([^"]+)"?/i.exec(contentDisposition);
  return match?.[1] || fallback;
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
  const [selectedLeaveRequest, setSelectedLeaveRequest] = useState(null);
  const [selectedSuggestionTeacher, setSelectedSuggestionTeacher] = useState(null);
  const [selectedSuggestionClass, setSelectedSuggestionClass] = useState(null);
  const [selectedSuggestionTeacherIds, setSelectedSuggestionTeacherIds] = useState([]);
  const [selectedClassTeacher, setSelectedClassTeacher] = useState(null);
  const [classTeacherAction, setClassTeacherAction] = useState("manage");
  const [classTeacherSuggestions, setClassTeacherSuggestions] = useState([]);
  const [selectedReassignTeacherId, setSelectedReassignTeacherId] = useState("");
  const [selectedReassignMode, setSelectedReassignMode] = useState("TEMPORARY");
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
  const [isAttendanceExporting, setIsAttendanceExporting] = useState(false);
  const [attendanceExportStatus, setAttendanceExportStatus] = useState({ kind: "", message: "" });
  const [attendanceExportForm, setAttendanceExportForm] = useState(() => getPreviousMonthDateRange());
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
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setHours(24, 0, 0, 0);
    const timeout = window.setTimeout(() => {
      setCurrentDate(new Date());
    }, Math.max(1000, nextMidnight.getTime() - now.getTime() + 1000));

    return () => window.clearTimeout(timeout);
  }, [currentDate]);

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
  const todayAttendanceRows = buildAttendanceRowsForDate({
    attendanceRecords,
    classes,
    teachers,
    attendanceDate: currentDate,
    currentDate,
    view: "current",
  });
  const attendanceDateKeys = getAttendanceDateKeys(attendanceRecords, attendanceView, currentDate);
  const attendanceDatePageCount = Math.max(1, attendanceDateKeys.length);
  const selectedAttendanceDateKey = attendanceDateKeys[Math.min(attendanceDatePage - 1, attendanceDatePageCount - 1)] || "";
  const selectedAttendanceDate = selectedAttendanceDateKey
    ? new Date(`${selectedAttendanceDateKey}T00:00:00`)
    : currentDate;
  const selectedAttendanceDateRows = buildAttendanceRowsForDate({
    attendanceRecords,
    classes,
    teachers,
    attendanceDate: selectedAttendanceDate,
    currentDate,
    view: attendanceView,
  });
  const visibleAttendanceRecords =
    attendanceView === "current"
      ? todayAttendanceRows
      : selectedAttendanceDateRows;
  const todayLabel = currentDate.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const selectedAttendanceDateLabel = selectedAttendanceDateKey
    ? new Date(`${selectedAttendanceDateKey}T00:00:00`).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "-";
  const selectedAttendanceDayCode = getDayCode(selectedAttendanceDate);
  const selectedAttendanceScheduledCount = classes
    .filter((item) => item.day_of_week === selectedAttendanceDayCode)
    .reduce((count, item) => count + (item.teacher_ids?.length || (item.teacher_id ? 1 : 0)), 0);
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

  function openAttendanceExportPanel() {
    setAttendanceExportForm(getPreviousMonthDateRange());
    setAttendanceExportStatus({ kind: "", message: "" });
    setIsAttendanceExportPanelOpen(true);
  }

  async function handleAttendanceExportSubmit(event) {
    event.preventDefault();

    if (!attendanceExportForm.start_date || !attendanceExportForm.end_date) {
      setAttendanceExportStatus({ kind: "error", message: "Select both start and end dates." });
      return;
    }

    if (attendanceExportForm.end_date < attendanceExportForm.start_date) {
      setAttendanceExportStatus({ kind: "error", message: "End date must be after start date." });
      return;
    }

    setIsAttendanceExporting(true);
    setAttendanceExportStatus({ kind: "", message: "" });

    try {
      const params = new URLSearchParams({
        start_date: attendanceExportForm.start_date,
        end_date: attendanceExportForm.end_date,
      });
      const response = await fetch(`${apiBase}/attendance-records/export?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || "Failed to export attendance report");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = getDownloadFilename(
        response,
        `teacher_attendance_${attendanceExportForm.start_date}_to_${attendanceExportForm.end_date}.xlsx`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setAttendanceExportStatus({ kind: "success", message: "Excel report downloaded." });
    } catch (error) {
      setAttendanceExportStatus({ kind: "error", message: error.message });
    } finally {
      setIsAttendanceExporting(false);
    }
  }

  async function handleManualAttendanceSubmit(event) {
    event.preventDefault();

    if (!manualAttendanceForm.teacher_id || !manualAttendanceForm.center_id || !manualAttendanceForm.checked_date || !manualAttendanceForm.checked_time) {
      return;
    }

    const success = await onCreateManualAttendance({
      teacherId: manualAttendanceForm.teacher_id,
      centerId: manualAttendanceForm.center_id,
      checkedAt: new Date(`${manualAttendanceForm.checked_date}T${manualAttendanceForm.checked_time}:00`).toISOString(),
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

  async function openClassTeacherPanel(classItem, teacherId, teacherName, assignmentMode = "PERMANENT", originalTeacherId = teacherId) {
    setSelectedClassTeacher({ classItem, teacherId, teacherName, assignmentMode, originalTeacherId });
    setClassTeacherAction("manage");
    setClassTeacherSuggestions([]);
    setSelectedReassignTeacherId("");
    setSelectedReassignMode("TEMPORARY");
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

    const confirmed = window.confirm("Restore this class to its permanent teacher now?");
    if (!confirmed) {
      return;
    }

    const success = await onRestorePermanentClassTeacher(
      selectedClassTeacher.classItem.class_id,
      selectedClassTeacher.originalTeacherId || selectedClassTeacher.teacherId,
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
          <p className="subtle">Recorded attendance events from users.</p>
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
            <div className="section-title-row">
              <h2>Attendance records</h2>
              <button
                type="button"
                className="section-add-button"
                onClick={openManualAttendancePanel}
                aria-label="Create manual attendance event"
                title="Create manual attendance event"
              >
                +
              </button>
              <button
                type="button"
                className="table-action-button"
                onClick={openAttendanceExportPanel}
              >
                Export Excel
              </button>
            </div>
            <p className="subtle">
              {attendanceView === "current"
                ? `Today: ${todayLabel} | ${getDayCode(currentDate)} | Teachers scheduled: ${todayAttendanceRows.length}`
                : `${attendanceView === "history" ? "History" : "All"}: ${selectedAttendanceDateLabel} | ${selectedAttendanceDayCode} | Teachers scheduled: ${selectedAttendanceScheduledCount}`}
            </p>
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
            {
              key: "expected_shift",
              label: "Expected Shift",
              render: (row) =>
                row.start_time && row.end_time
                  ? `${formatTimeValue(row.start_time)} - ${formatTimeValue(row.end_time)}`
                  : "-",
            },
            {
              key: "checked_at",
              label: "Check-in",
              render: (row) => formatClockTimeValue(row.checked_at),
            },
            { key: "check_out_at", label: "Checkout", render: (row) => formatClockTimeValue(row.check_out_at) },
            {
              key: "nearest_center_name",
              label: "Location",
              render: (row) =>
                !row.checked_at || row.status === "VALID" || row.status === "MANUAL" || row.status === "-"
                  ? row.nearest_center_name || "Nearest center"
                  : "INVALID",
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
          pageSize={attendanceView === "current" ? 10 : null}
        />
        {attendanceView !== "current" && attendanceDateKeys.length > 0 ? (
          <div className="table-pagination">
            <span>
              Page {attendanceDatePage} of {attendanceDatePageCount}
            </span>
            <div className="table-pagination-actions">
              <button
                type="button"
                className="table-action-button table-action-button-muted"
                disabled={attendanceDatePage === 1}
                onClick={() => setAttendanceDatePage((current) => Math.max(1, current - 1))}
              >
                Newer day
              </button>
              <button
                type="button"
                className="table-action-button"
                disabled={attendanceDatePage === attendanceDatePageCount}
                onClick={() => setAttendanceDatePage((current) => Math.min(attendanceDatePageCount, current + 1))}
              >
                Older day
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {isManualAttendancePanelOpen ? (
        <FloatingPanel
          eyebrow="Attendance"
          title="Manual attendance"
          titleId="manual-attendance-title"
          onClose={() => setIsManualAttendancePanelOpen(false)}
        >
          <form className="floating-panel-form" onSubmit={handleManualAttendanceSubmit}>
            <label className="field">
              <span>Type</span>
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
                <option value="CHECK_IN">Check-in</option>
                <option value="CHECK_OUT">Checkout</option>
              </select>
            </label>

            <label className="field">
              <span>Teacher</span>
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
              <span>Center</span>
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
                <span>Date</span>
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
                <span>{manualAttendanceForm.event_type === "CHECK_OUT" ? "Checkout time" : "Check-in time"}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="HH:MM"
                  pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                  title="Use 24-hour time, HH:MM from 00:00 to 23:59"
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
                <span>Status</span>
                <StatusPill value="MANUAL" />
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
                  ? "Saving..."
                  : `Save manual ${manualAttendanceForm.event_type === "CHECK_OUT" ? "checkout" : "check-in"}`}
              </button>
              <button
                type="button"
                className="table-action-button table-action-button-muted"
                onClick={() => setIsManualAttendancePanelOpen(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </FloatingPanel>
      ) : null}

      {isAttendanceExportPanelOpen ? (
        <FloatingPanel
          eyebrow="Attendance"
          title="Export teacher report"
          titleId="attendance-export-title"
          onClose={() => setIsAttendanceExportPanelOpen(false)}
        >
          <form className="floating-panel-form" onSubmit={handleAttendanceExportSubmit}>
            <div className="floating-panel-grid">
              <label className="field">
                <span>Start date</span>
                <input
                  type="date"
                  value={attendanceExportForm.start_date}
                  required
                  onChange={(event) =>
                    setAttendanceExportForm((current) => ({
                      ...current,
                      start_date: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="field">
                <span>End date</span>
                <input
                  type="date"
                  value={attendanceExportForm.end_date}
                  required
                  onChange={(event) =>
                    setAttendanceExportForm((current) => ({
                      ...current,
                      end_date: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            {attendanceExportStatus.message ? (
              <p className={`status-banner ${attendanceExportStatus.kind}`}>
                {attendanceExportStatus.message}
              </p>
            ) : null}

            <div className="floating-panel-actions">
              <button
                type="submit"
                className="table-action-button"
                disabled={isAttendanceExporting}
              >
                {isAttendanceExporting ? "Exporting..." : "Download Excel"}
              </button>
              <button
                type="button"
                className="table-action-button table-action-button-muted"
                onClick={() => setIsAttendanceExportPanelOpen(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </FloatingPanel>
      ) : null}

      {selectedClassTime ? (
        <FloatingPanel
          eyebrow="Class Time"
          title={`${selectedClassTime.center_label || selectedClassTime.center_id} | ${selectedClassTime.day_of_week}`}
          titleId="class-time-edit-title"
          onClose={() => setSelectedClassTime(null)}
        >
          <form className="floating-panel-form" onSubmit={handleClassTimeSubmit}>
            <div className="floating-panel-grid">
              <div>
                <p className="subtle">Status</p>
                <StatusPill value={selectedClassTime.status} />
              </div>
              <div>
                <p className="subtle">Teachers</p>
                <strong>{selectedClassTime.teacher_count || selectedClassTime.teacher_ids?.length || 0}/2</strong>
              </div>
            </div>

            <label className="field">
              <span>Start Time</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="HH:MM"
                pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                title="Use 24-hour time, HH:MM from 00:00 to 23:59"
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
              <span>End Time</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="HH:MM"
                pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                title="Use 24-hour time, HH:MM from 00:00 to 23:59"
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
                {pendingAction === `class-time-${selectedClassTime.class_id}` ? "Saving..." : "Save time"}
              </button>
              <button
                type="button"
                className="table-action-button table-action-button-muted"
                onClick={() => setSelectedClassTime(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </FloatingPanel>
      ) : null}

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
            { key: "user_code", label: "User Code" },
            {
              key: "name",
              label: "Name",
              render: (row) => (
                <button type="button" className="teacher-name-button" onClick={() => setSelectedTeacherDetail(row)}>
                  {formatValue(row.name)}
                </button>
              ),
            },
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
        ) : replacementQueue.length === 0 ? (
          <p className="subtle">No classes found.</p>
        ) : (
          <div className="center-class-group">
            <div className="center-class-head">
              <div>
                <h3>{currentAssignmentCenterLabel}</h3>
                <span className="subtle">{currentAssignmentClasses.length} classes</span>
              </div>
              <span className="subtle">
                Center {assignmentCenterPage} of {assignmentCenterPageCount}
              </span>
            </div>

            <div className="class-week-grid assignment-week-grid" role="table" aria-label={`${currentAssignmentCenterLabel} assignment queue by weekday`}>
              {CLASS_DAYS.map((day) => {
                const dayClasses = currentAssignmentClasses
                  .filter((item) => item.day_of_week === day)
                  .sort((left, right) => String(left.start_time).localeCompare(String(right.start_time)));

                return (
                  <div className="class-week-column" role="cell" key={`${currentAssignmentCenterLabel}-${day}`}>
                    <div className="class-week-day">{day}</div>
                    <div className="class-week-list">
                      {dayClasses.length === 0 ? (
                        <span className="class-week-empty">No classes</span>
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
                                title="Edit class time"
                              >
                                {formatTimeValue(item.start_time)} - {formatTimeValue(item.end_time)}
                              </button>
                              {renderTeacherNames(item.teacher_label, item.teacher_ids, getClassTeacherModes(item), item.original_teacher_ids, (teacherId, teacherName, assignmentMode, originalTeacherId) =>
                                openClassTeacherPanel(item, teacherId, teacherName, assignmentMode, originalTeacherId),
                              )}
                              {canAssignMoreTeachers ? (
                                <button
                                  type="button"
                                  className="table-action-button assignment-load-button"
                                  disabled={pendingAction === `suggest-${item.class_id}`}
                                  onClick={() => openSuggestionPanel(item)}
                                >
                                  {pendingAction === `suggest-${item.class_id}` ? "Loading..." : "Load suggestions"}
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
                {currentAssignmentCenterLabel} | {assignmentCenterPage} of {assignmentCenterPageCount}
              </span>
              <div className="table-pagination-actions">
                <button
                  type="button"
                  className="table-action-button table-action-button-muted"
                  disabled={assignmentCenterPage === 1}
                  onClick={() => setAssignmentCenterPage((current) => Math.max(1, current - 1))}
                >
                  Previous center
                </button>
                <button
                  type="button"
                  className="table-action-button"
                  disabled={assignmentCenterPage === assignmentCenterPageCount}
                  onClick={() => setAssignmentCenterPage((current) => Math.min(assignmentCenterPageCount, current + 1))}
                >
                  Next center
                </button>
              </div>
            </div>
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

      {selectedClassTeacher ? (
        <FloatingPanel
          eyebrow="Class Teacher"
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
              <p className="subtle">Class</p>
              <strong>{selectedClassTeacher.classItem.day_of_week}</strong>
            </div>
            <div>
              <p className="subtle">Time</p>
              <strong>
                {formatTimeValue(selectedClassTeacher.classItem.start_time)} - {formatTimeValue(selectedClassTeacher.classItem.end_time)}
              </strong>
            </div>
            <div>
              <p className="subtle">Center</p>
              <strong>{formatValue(selectedClassTeacher.classItem.center_label)}</strong>
            </div>
            <div>
              <p className="subtle">Teacher</p>
              <strong>{selectedClassTeacher.teacherName}</strong>
              <p className={`subtle assignment-type-label ${selectedClassTeacher.assignmentMode === "TEMPORARY" ? "temporary" : ""}`}>
                Current assignment: {selectedClassTeacher.assignmentMode === "TEMPORARY" ? "Temporary" : "Permanent"}
              </p>
            </div>
          </div>

          {classTeacherAction === "reassign" ? (
            <div className="floating-panel-section">
              <div className="field">
                <span>Reassign mode</span>
                <div className="reassign-mode-grid" role="group" aria-label="Reassign mode">
                  {REASSIGNMENT_MODES.map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      className={`reassign-mode-option${selectedReassignMode === mode.value ? " selected" : ""}`}
                      onClick={() => setSelectedReassignMode(mode.value)}
                    >
                      <strong>{mode.title}</strong>
                      <span>{mode.description}</span>
                    </button>
                  ))}
                </div>
              </div>
              <label className="field">
                <span>Reassign to</span>
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
                <p className="subtle">No eligible teachers found for this class.</p>
              ) : null}
            </div>
          ) : null}

          <div className="floating-panel-actions">
            {classTeacherAction === "manage" ? (
              <>
                {selectedClassTeacher.assignmentMode === "TEMPORARY" ? (
                  <>
                    <p className="subtle floating-panel-action-note">Temporary assignments return to the original teacher tomorrow.</p>
                    <button
                      type="button"
                      className="table-action-button table-action-button-muted"
                      disabled={
                        pendingAction === `class-teacher-restore-${selectedClassTeacher.classItem.class_id}-${selectedClassTeacher.originalTeacherId || selectedClassTeacher.teacherId}`
                      }
                      onClick={handleRestorePermanentClassTeacher}
                    >
                      {pendingAction === `class-teacher-restore-${selectedClassTeacher.classItem.class_id}-${selectedClassTeacher.originalTeacherId || selectedClassTeacher.teacherId}`
                        ? "Restoring..."
                        : "Restore permanent"}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="table-action-button table-action-button-muted"
                    disabled={pendingAction === `class-teacher-remove-${selectedClassTeacher.classItem.class_id}-${selectedClassTeacher.teacherId}`}
                    onClick={handleRemoveClassTeacher}
                  >
                    {pendingAction === `class-teacher-remove-${selectedClassTeacher.classItem.class_id}-${selectedClassTeacher.teacherId}` ? "Removing..." : "Remove"}
                  </button>
                )}
                <button type="button" className="table-action-button" onClick={openReassignClassTeacher}>
                  Reassign
                </button>
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
                    ? "Reassigning..."
                    : "Save reassign"}
                </button>
                <button
                  type="button"
                  className="table-action-button table-action-button-muted"
                  onClick={() => setClassTeacherAction("manage")}
                >
                  Back
                </button>
              </>
            )}
          </div>
        </FloatingPanel>
      ) : null}

      {selectedSuggestionClass ? (
        <FloatingPanel
          eyebrow="Replacement Suggestions"
          title={`${selectedSuggestionClass.center_label || selectedSuggestionClass.center_id} | ${selectedSuggestionClass.day_of_week} ${formatTimeValue(selectedSuggestionClass.start_time)} - ${formatTimeValue(selectedSuggestionClass.end_time)}`}
          titleId="replacement-suggestions-title"
          onClose={() => {
            setSelectedSuggestionClass(null);
            setSelectedSuggestionTeacherIds([]);
          }}
        >
          <div className="floating-panel-section">
            <div className="replacement-selection-summary">
              <span className="subtle">Select up to {selectedClassAvailableTeacherSlots} teachers</span>
              <strong>{selectedSuggestionTeacherIds.length}/{selectedClassAvailableTeacherSlots} selected</strong>
            </div>
          </div>

          {selectedClassSuggestions.length === 0 ? (
            <p className="subtle">No eligible teachers found.</p>
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
                        <span className="subtle">
                          Final {suggestion.final_score.toFixed(4)} | ELO {suggestion.normalized_score.toFixed(4)} | Education {suggestion.normalized_education_score.toFixed(4)}
                        </span>
                        <span className="subtle">
                          Center match {suggestion.center_match ? "Yes" : "No"} | Time match {suggestion.time_match ? "Yes" : "No"}
                        </span>
                        <span className="subtle">
                          Slots {suggestion.assigned_slots_that_day}/{suggestion.max_slots_per_day}
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
              {pendingAction.startsWith(`assign-${selectedSuggestionClass.class_id}-`) ? "Assigning..." : "Assign selected"}
            </button>
          </div>
        </FloatingPanel>
      ) : null}

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

      {selectedTeacherDetail ? (
        <FloatingPanel
          eyebrow="Teacher Detail"
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
              <p className="subtle">Assigned Classes</p>
              <strong>{selectedTeacherAssignedClasses.length}</strong>
            </div>
            <div>
              <p className="subtle">Today Classes</p>
              <strong>{selectedTeacherTodayRows.length}</strong>
            </div>
            <div>
              <p className="subtle">Checked In Today</p>
              <strong>{selectedTeacherTodayRows.filter((item) => item.checked_at).length}</strong>
            </div>
            <div>
              <p className="subtle">Checked Out Today</p>
              <strong>{selectedTeacherTodayRows.filter((item) => item.check_out_at).length}</strong>
            </div>
          </div>

          <div className="floating-panel-section">
            <p className="subtle">Today attendance status</p>
            {selectedTeacherTodayRows.length === 0 ? (
              <p className="subtle">No classes scheduled today.</p>
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
                        <span className="subtle">Check-in</span>
                        <StatusPill value={item.attendance_status || "PENDING"} />
                        <span className="subtle">{formatClockTimeValue(item.checked_at)}</span>
                      </div>
                      <div className="teacher-detail-session-status">
                        <span className="subtle">Checkout</span>
                        <StatusPill value={item.checkout_status || "-"} />
                        <span className="subtle">{formatClockTimeValue(item.check_out_at)}</span>
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

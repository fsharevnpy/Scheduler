import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

import LanguageToggle from "../../components/LanguageToggle.jsx";
import ChessHeader from "../../components/ChessHeader.jsx";
import NotificationBell from "../../components/NotificationBell.jsx";
import UserAvatar from "../../components/UserAvatar.jsx";
import WebPushControl from "../../components/WebPushControl.jsx";
import { useLanguage } from "../../lib/i18n.jsx";
import { getRoleTitle } from "../../lib/roles.js";
import { requestJson } from "../../lib/http.js";
import { loadAttendanceRecords } from "../../lib/attendance.js";
import { buildManagerEventsWebSocketUrl, buildTeacherEventsWebSocketUrl } from "../../lib/teacherEvents.js";
import AdminMonitorView from "./AdminMonitorView.jsx";
import TeacherMonitorView from "./TeacherMonitorView.jsx";
import { formatDateTimeValue } from "./monitorUtils.js";

function message(key, values) {
  return { key, values };
}

function generateLeaveRequestId(leaveRequests) {
  const maxSequence = leaveRequests.reduce((currentMax, item) => {
    const match = /^LR(\d+)$/.exec(item.request_id || "");
    if (!match) {
      return currentMax;
    }

    return Math.max(currentMax, Number(match[1]));
  }, -1);

  return `LR${maxSequence + 1}`;
}

export default function MonitorPage({ auth }) {
  const user = auth.user;
  const { t } = useLanguage();
  const [state, setState] = useState({
    isLoading: true,
    error: "",
    centers: [],
    teachers: [],
    classes: [],
    leaveRequests: [],
    attendanceRecords: [],
    resetRequests: [],
    users: [],
    teacherScores: [],
    unreadScoreEvents: [],
    unreadManagerEvents: [],
    leaveRequestManagers: [],
  });
  const [storedActionStatus, setActionStatus] = useState({ kind: "", message: "" });
  const actionStatus = {
    ...storedActionStatus,
    message: typeof storedActionStatus.message === "string" ? t(storedActionStatus.message)
      : t(storedActionStatus.message.key, storedActionStatus.message.values),
  };
  const [pendingAction, setPendingAction] = useState("");
  const [replacementSuggestions, setReplacementSuggestions] = useState({});

  const headers = useMemo(() => ({ Authorization: `Bearer ${auth.token}` }), [auth.token]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadData() {
      setState((current) => {
        const hasLoadedData =
          current.centers.length > 0 ||
          current.teachers.length > 0 ||
          current.classes.length > 0 ||
          current.leaveRequests.length > 0 ||
          current.attendanceRecords.length > 0 ||
          current.resetRequests.length > 0 ||
          current.users.length > 0;

        return {
          ...current,
          isLoading: !hasLoadedData,
          error: "",
        };
      });

      try {
        const requests = [
          requestJson(`${auth.apiBase}/centers`, { headers }),
          requestJson(`${auth.apiBase}/classes`, { headers }),
          requestJson(`${auth.apiBase}/leave-requests`, { headers }),
          loadAttendanceRecords(auth.apiBase, { headers, signal: controller.signal }),
          requestJson(`${auth.apiBase}/teacher-scores`, { headers }),
        ];

        if (user.role === "manager" || user.role === "developer") {
          requests.push(requestJson(`${auth.apiBase}/teachers`, { headers }));
          requests.push(requestJson(`${auth.apiBase}/password-reset-requests`, { headers }));
        }

        if (user.role === "teacher") {
          requests.push(requestJson(`${auth.apiBase}/teacher-events/unread`, { headers }));
          requests.push(requestJson(`${auth.apiBase}/leave-request-managers`, { headers }));
        }

        if (user.role === "manager") {
          requests.push(requestJson(`${auth.apiBase}/manager-events/unread`, { headers }));
        }

        if (user.role === "developer") {
          requests.push(requestJson(`${auth.apiBase}/users`, { headers }));
        }

        const results = await Promise.all(requests);
        const [centers, classes, leaveRequests, attendanceRecords, teacherScores] = results;
        let resultIndex = 5;
        let teachers = [];
        let resetRequests = [];
        let unreadScoreEvents = [];
        let unreadManagerEvents = [];
        let leaveRequestManagers = [];
        let users = [];

        if (user.role === "manager" || user.role === "developer") {
          teachers = results[resultIndex++] || [];
          resetRequests = results[resultIndex++] || [];
        }

        if (user.role === "teacher") {
          unreadScoreEvents = results[resultIndex++] || [];
          leaveRequestManagers = results[resultIndex++] || [];
        }

        if (user.role === "manager") {
          unreadManagerEvents = results[resultIndex++] || [];
        }

        if (user.role === "developer") {
          users = results[resultIndex++] || [];
        }

        if (!cancelled) {
          setState({
            isLoading: false,
            error: "",
            centers,
            teachers,
            classes,
            leaveRequests,
            attendanceRecords,
            resetRequests,
            users,
            teacherScores,
            unreadScoreEvents,
            unreadManagerEvents,
            leaveRequestManagers,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            isLoading: false,
            error: error.message,
            centers: [],
            teachers: [],
            classes: [],
            leaveRequests: [],
            attendanceRecords: [],
            resetRequests: [],
            users: [],
            teacherScores: [],
            unreadScoreEvents: [],
            unreadManagerEvents: [],
            leaveRequestManagers: [],
          });
        }
      }
    }

    loadData();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [auth.apiBase, headers, user.role]);

  useEffect(() => {
    if (user.role !== "teacher" || !auth.token) {
      return undefined;
    }

    let socket = null;
    let reconnectTimer = null;
    let isClosedByEffect = false;

    async function refreshScores() {
      try {
        const teacherScores = await requestJson(`${auth.apiBase}/teacher-scores`, { headers });
        setState((current) => ({ ...current, teacherScores }));
      } catch {
        // Realtime notifications should not interrupt the monitor if a refresh races with logout.
      }
    }

    function connect() {
      socket = new WebSocket(buildTeacherEventsWebSocketUrl(auth.apiBase, auth.token));

      socket.onmessage = (message) => {
        const payload = JSON.parse(message.data);
        if (payload.type !== "teacher_event" || !payload.event) {
          return;
        }

        setState((current) => {
          const exists = current.unreadScoreEvents.some((item) => item.event_id === payload.event.event_id);
          if (exists) {
            return current;
          }

          return {
            ...current,
            unreadScoreEvents: [payload.event, ...current.unreadScoreEvents],
          };
        });

        if (payload.event.event_type === "SCORE") {
          refreshScores();
        }
      };

      socket.onclose = () => {
        if (!isClosedByEffect) {
          reconnectTimer = window.setTimeout(connect, 3000);
        }
      };
    }

    connect();

    return () => {
      isClosedByEffect = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      if (socket) {
        socket.close();
      }
    };
  }, [auth.apiBase, auth.token, headers, user.role]);

  useEffect(() => {
    if (user.role !== "manager" || !auth.token) {
      return undefined;
    }

    let socket = null;
    let reconnectTimer = null;
    let isClosedByEffect = false;

    function connect() {
      socket = new WebSocket(buildManagerEventsWebSocketUrl(auth.apiBase, auth.token));

      socket.onmessage = (message) => {
        const payload = JSON.parse(message.data);
        if (payload.type !== "manager_event" || !payload.event) {
          return;
        }

        setState((current) => {
          const exists = current.unreadManagerEvents.some((item) => item.request_id === payload.event.request_id);
          if (exists) {
            return current;
          }

          return {
            ...current,
            unreadManagerEvents: [payload.event, ...current.unreadManagerEvents],
          };
        });
      };

      socket.onclose = () => {
        if (!isClosedByEffect) {
          reconnectTimer = window.setTimeout(connect, 3000);
        }
      };
    }

    connect();

    return () => {
      isClosedByEffect = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      if (socket) {
        socket.close();
      }
    };
  }, [auth.apiBase, auth.token, user.role]);

  async function runAction(actionKey, action, successMessage, onSuccess) {
    setPendingAction(actionKey);
    setActionStatus({ kind: "", message: "" });

    try {
      const result = await action();
      if (onSuccess) {
        await onSuccess(result);
      }
      if (successMessage) {
        setActionStatus({ kind: "success", message: successMessage });
      }
      return true;
    } catch (error) {
      setActionStatus({ kind: "error", message: error.message });
      return false;
    } finally {
      setPendingAction("");
    }
  }

  async function approveLeaveRequest(requestId) {
    await runAction(
      `approve-${requestId}`,
      () => requestJson(`${auth.apiBase}/leave-requests/${requestId}/approve`, { method: "PUT", headers }),
      message("Approved leave request {p0}.", { p0: requestId }),
      () => {
        setState((current) => ({
          ...current,
          leaveRequests: current.leaveRequests.map((item) =>
            item.request_id === requestId ? { ...item, status: "APPROVED" } : item,
          ),
        }));
      },
    );
  }

  function applyInactiveLeaveRequestStatus(current, requestId, nextStatus, leaveRequest) {
    const nextLeaveRequests = current.leaveRequests.map((item) =>
      item.request_id === requestId ? { ...item, status: nextStatus } : item,
    );

    const shouldResetClassStatus = leaveRequest
      ? nextLeaveRequests.every(
          (item) =>
            item.class_id !== leaveRequest.class_id ||
            !["REQUESTED", "APPROVED"].includes(item.status),
        )
      : false;

    return {
      ...current,
      leaveRequests: nextLeaveRequests,
      classes: current.classes.map((item) => {
        if (!leaveRequest || item.class_id !== leaveRequest.class_id || !shouldResetClassStatus) {
          return item;
        }

        return {
          ...item,
          status: (item.teacher_count || item.teacher_ids?.length || (item.teacher_id ? 1 : 0)) > 0 ? "ASSIGNED" : "OPEN",
        };
      }),
    };
  }

  async function transitionLeaveRequest(requestId, endpointAction, nextStatus) {
    const leaveRequest = state.leaveRequests.find((item) => item.request_id === requestId);

    await runAction(
      `${endpointAction}-${requestId}`,
      () => requestJson(`${auth.apiBase}/leave-requests/${requestId}/${endpointAction}`, { method: "PUT", headers }),
      message(nextStatus === "REJECTED" ? "Rejected leave request {p0}." : "Cancelled leave request {p0}.", { p0: requestId }),
      () => {
        setState((current) => applyInactiveLeaveRequestStatus(current, requestId, nextStatus, leaveRequest));
      },
    );
  }

  async function rejectLeaveRequest(requestId) {
    await transitionLeaveRequest(requestId, "reject", "REJECTED");
  }

  async function cancelLeaveRequest(requestId) {
    await transitionLeaveRequest(requestId, "cancel", "CANCELLED");
  }

  async function createLeaveRequest({ classId, reason, assignedManagerCode }) {
    const requestId = generateLeaveRequestId(state.leaveRequests);
    const requestDate = new Date().toISOString().slice(0, 10);

    return runAction(
      "create-leave-request",
      () =>
        requestJson(`${auth.apiBase}/leave-requests`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            request_id: requestId,
            class_id: classId,
            teacher_id: user.teacher_id,
            assigned_manager_code: assignedManagerCode,
            request_date: requestDate,
            reason,
            status: "REQUESTED",
          }),
        }),
      message("Created leave request {p0}.", { p0: requestId }),
      () => {
        setState((current) => ({
          ...current,
          leaveRequests: [
            ...current.leaveRequests,
            (() => {
              const selectedClass = current.classes.find((item) => item.class_id === classId);
              return {
                request_id: requestId,
                class_id: classId,
                teacher_id: user.teacher_id,
                assigned_manager_code: assignedManagerCode,
                assigned_manager_name:
                  current.leaveRequestManagers.find((item) => item.user_code === assignedManagerCode)?.display_name ||
                  assignedManagerCode,
                class_day_of_week: selectedClass?.day_of_week || "-",
                request_date: requestDate,
                reason,
                status: "REQUESTED",
              };
            })(),
          ],
          classes: current.classes.map((item) =>
            item.class_id === classId
              ? {
                  ...item,
                  status: "NEED_REPLACEMENT",
                }
              : item,
          ),
        }));
      },
    );
  }

  async function checkInAttendance({ latitude, longitude, accuracy }) {
    return runAction(
      "attendance-check-in",
      () =>
        requestJson(`${auth.apiBase}/attendance-records/check-in`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            latitude,
            longitude,
            accuracy_meters: accuracy ?? null,
          }),
        }),
      message("Attendance recorded."),
      (record) => {
        setState((current) => ({
          ...current,
          attendanceRecords: [record, ...current.attendanceRecords],
        }));
      },
    );
  }

  async function checkOutAttendance({ latitude, longitude, accuracy }) {
    return runAction(
      "attendance-check-out",
      () =>
        requestJson(`${auth.apiBase}/attendance-records/check-out`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            latitude,
            longitude,
            accuracy_meters: accuracy ?? null,
          }),
        }),
      message("Checkout recorded."),
      (record) => {
        setState((current) => ({
          ...current,
          attendanceRecords: [record, ...current.attendanceRecords],
        }));
      },
    );
  }

  async function createManualAttendance({ teacherId, centerId, checkedAt, eventType }) {
    return runAction(
      "manual-attendance",
      () =>
        requestJson(`${auth.apiBase}/attendance-records/manual`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            teacher_id: teacherId,
            center_id: centerId,
            checked_at: checkedAt,
            event_type: eventType,
          }),
        }),
      message("Manual attendance recorded."),
      (record) => {
        setState((current) => ({
          ...current,
          attendanceRecords: [record, ...current.attendanceRecords],
        }));
      },
    );
  }

  async function updateClassTime(classId, payload) {
    return runAction(
      `class-time-${classId}`,
      () =>
        requestJson(`${auth.apiBase}/classes/${classId}`, {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      message("Updated class time for {p0}.", { p0: classId }),
      () => {
        setState((current) => ({
          ...current,
          classes: current.classes.map((item) =>
            item.class_id === classId
              ? {
                  ...item,
                  ...payload,
                }
              : item,
          ),
        }));
      },
    );
  }

  async function resetPasswordRequest(requestId) {
    await runAction(
      `reset-request-${requestId}`,
      async () => {
        const response = await requestJson(`${auth.apiBase}/password-reset-requests/${requestId}/reset-default`, {
          method: "PUT",
          headers,
        });

        setActionStatus({
          kind: "success",
          message: message("Reset password for request {p0}. Default password: {p1}.", { p0: requestId, p1: response.default_password }),
        });

        return response;
      },
      "",
      () => {
        setState((current) => ({
          ...current,
          resetRequests: current.resetRequests.map((item) =>
            item.request_id === requestId ? { ...item, status: "RESOLVED" } : item,
          ),
        }));
      },
    );
  }

  async function loadReplacementSuggestions(classId, replaceTeacherId = "") {
    setPendingAction(`suggest-${classId}`);
    setActionStatus({ kind: "", message: "" });

    try {
      const query = replaceTeacherId ? `?replace_teacher_id=${encodeURIComponent(replaceTeacherId)}` : "";
      const suggestions = await requestJson(`${auth.apiBase}/classes/${classId}/replacement-suggestions${query}`, { headers });
      if (!replaceTeacherId) {
        setReplacementSuggestions((current) => ({ ...current, [classId]: suggestions }));
      }
      setActionStatus({ kind: "success", message: message("Loaded replacement suggestions for {p0}.", { p0: classId }) });
      return suggestions;
    } catch (error) {
      setActionStatus({ kind: "error", message: error.message });
      return [];
    } finally {
      setPendingAction("");
    }
  }

  async function assignReplacement(classId, teacherId, mode = "PERMANENT", effectiveDate = null) {
    const success = await runAction(
      `assign-${classId}-${teacherId}`,
      () =>
        requestJson(`${auth.apiBase}/classes/${classId}/assign-replacement`, {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ teacher_id: teacherId, mode, effective_date: mode === "TEMPORARY" ? effectiveDate : null }),
        }),
      message("Assigned replacement {p0} to class {p1}.", { p0: teacherId, p1: classId }),
      async () => {
        if (mode === "TEMPORARY") {
          const classes = await requestJson(`${auth.apiBase}/classes`, { headers });
          setState((current) => ({ ...current, classes }));
          return;
        }
        setState((current) => ({
          ...current,
          classes: current.classes.map((item) => {
            if (item.class_id !== classId) {
              return item;
            }

            const teacherIds = item.teacher_ids || (item.teacher_id ? [item.teacher_id] : []);
            const nextTeacherIds = teacherIds.includes(teacherId) ? teacherIds : [...teacherIds, teacherId];
            const teacherLabels = item.teacher_labels || (item.teacher_label && item.teacher_label !== "-" ? [item.teacher_label] : []);
            const teacherName = teachersById.get(teacherId) || "-";
            const teacherLabel = teacherName;
            const nextTeacherLabels = teacherLabels.includes(teacherLabel) ? teacherLabels : [...teacherLabels, teacherLabel];
            const teacherModes = item.teacher_assignment_modes || teacherIds.map(() => "PERMANENT");
            const nextTeacherModes = teacherIds.includes(teacherId) ? teacherModes : [...teacherModes, "PERMANENT"];
            const originalTeacherIds = item.original_teacher_ids || teacherIds;
            const nextOriginalTeacherIds = teacherIds.includes(teacherId) ? originalTeacherIds : [...originalTeacherIds, teacherId];
            return {
              ...item,
              teacher_id: item.teacher_id || teacherId,
              teacher_ids: nextTeacherIds,
              teacher_labels: nextTeacherLabels,
              teacher_assignment_modes: nextTeacherModes,
              original_teacher_ids: nextOriginalTeacherIds,
              teacher_label: nextTeacherLabels.join(", "),
              teacher_count: nextTeacherIds.length,
              status: "ASSIGNED",
            };
          }),
        }));
      },
    );

    if (success) {
      setReplacementSuggestions((current) => {
        const next = { ...current };
        delete next[classId];
        return next;
      });
    }

    return success;
  }

  function updateClassTeacherList(item, nextTeacherIds) {
    const nextTeacherLabels = nextTeacherIds.map((teacherId) => teachersById.get(teacherId) || teacherId);
    const previousTeacherIds = item.teacher_ids || (item.teacher_id ? [item.teacher_id] : []);
    const previousTeacherModes = item.teacher_assignment_modes || previousTeacherIds.map(() => "PERMANENT");
    const previousOriginalTeacherIds = item.original_teacher_ids || previousTeacherIds;
    const nextTeacherModes = nextTeacherIds.map((teacherId) => {
      const previousIndex = previousTeacherIds.indexOf(teacherId);
      return previousIndex >= 0 ? previousTeacherModes[previousIndex] || "PERMANENT" : "PERMANENT";
    });
    const nextOriginalTeacherIds = nextTeacherIds.map((teacherId) => {
      const previousIndex = previousTeacherIds.indexOf(teacherId);
      return previousIndex >= 0 ? previousOriginalTeacherIds[previousIndex] || teacherId : teacherId;
    });

    return {
      ...item,
      teacher_id: nextTeacherIds[0] || null,
      teacher_ids: nextTeacherIds,
      teacher_labels: nextTeacherLabels,
      teacher_assignment_modes: nextTeacherModes,
      original_teacher_ids: nextOriginalTeacherIds,
      teacher_label: nextTeacherLabels.length > 0 ? nextTeacherLabels.join(", ") : "-",
      teacher_count: nextTeacherIds.length,
      status: nextTeacherIds.length > 0 ? item.status === "NEED_REPLACEMENT" ? "NEED_REPLACEMENT" : "ASSIGNED" : "OPEN",
    };
  }

  async function removeClassTeacher(classId, teacherId) {
    return runAction(
      `class-teacher-remove-${classId}-${teacherId}`,
      () =>
        requestJson(`${auth.apiBase}/classes/${classId}/teachers/${teacherId}`, {
          method: "DELETE",
          headers,
        }),
      message("Removed {p0} from class {p1}.", { p0: teacherId, p1: classId }),
      () => {
        setState((current) => ({
          ...current,
          classes: current.classes.map((item) => {
            if (item.class_id !== classId) {
              return item;
            }

            const teacherIds = item.teacher_ids || (item.teacher_id ? [item.teacher_id] : []);
            return updateClassTeacherList(
              item,
              teacherIds.filter((itemTeacherId) => itemTeacherId !== teacherId),
            );
          }),
        }));
      },
    );
  }

  async function reassignClassTeacher(classId, oldTeacherId, nextTeacherId, mode = "PERMANENT", effectiveDate = null) {
    const normalizedMode = String(mode || "PERMANENT").toUpperCase();
    return runAction(
      `class-teacher-reassign-${classId}-${oldTeacherId}`,
      () =>
        requestJson(`${auth.apiBase}/classes/${classId}/teachers/${oldTeacherId}/reassign`, {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ teacher_id: nextTeacherId, mode: normalizedMode, effective_date: normalizedMode === "TEMPORARY" ? effectiveDate : null }),
        }),
      normalizedMode === "TEMPORARY"
        ? message("Temporarily reassigned class {p0} to {p1}.", { p0: classId, p1: nextTeacherId })
        : message("Reassigned class {p0} to {p1}.", { p0: classId, p1: nextTeacherId }),
      async () => {
        const classes = await requestJson(`${auth.apiBase}/classes`, { headers });
        setState((current) => ({
          ...current,
          classes,
        }));
      },
    );
  }

  async function restorePermanentClassTeacher(classId, originalTeacherId, effectiveDate = null) {
    return runAction(
      `class-teacher-restore-${classId}-${originalTeacherId}`,
      () =>
        requestJson(`${auth.apiBase}/classes/${classId}/teachers/${originalTeacherId}/temporary-reassignment${effectiveDate ? `?effective_date=${effectiveDate}` : ""}`, {
          method: "DELETE",
          headers,
        }),
      message("Restored permanent teacher for class {p0}.", { p0: classId }),
      async () => {
        const classes = await requestJson(`${auth.apiBase}/classes`, { headers });
        setState((current) => ({
          ...current,
          classes,
        }));
      },
    );
  }

  async function updateTeacherActive(teacherId, active) {
    await runAction(
      `teacher-active-${teacherId}`,
      () =>
        requestJson(`${auth.apiBase}/teachers/${teacherId}`, {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ active }),
        }),
      message("Updated active status for {p0}.", { p0: teacherId }),
      () => {
        setState((current) => ({
          ...current,
          teachers: current.teachers.map((item) =>
            item.teacher_id === teacherId
              ? {
                  ...item,
                  active,
                }
              : item,
          ),
        }));
      },
    );
  }

  async function updateTeacherProfile(teacherId, payload) {
    return runAction(
      `teacher-profile-${teacherId}`,
      () =>
        requestJson(`${auth.apiBase}/teachers/${teacherId}`, {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      message("Updated teacher profile for {p0}.", { p0: teacherId }),
      () => {
        setState((current) => ({
          ...current,
          teachers: current.teachers.map((item) =>
            item.teacher_id === teacherId
              ? {
                  ...item,
                  ...payload,
                }
              : item,
          ),
        }));
      },
    );
  }

  async function deleteTeacherProfileImage(teacherId) {
    return runAction(
      `teacher-avatar-delete-${teacherId}`,
      () =>
        requestJson(`${auth.apiBase}/teachers/${teacherId}/profile-image`, {
          method: "DELETE",
          headers,
        }),
      message("Deleted profile image for {p0}.", { p0: teacherId }),
      () => {
        setState((current) => ({
          ...current,
          teachers: current.teachers.map((item) =>
            item.teacher_id === teacherId
              ? {
                  ...item,
                  profile_image_url: null,
                }
              : item,
          ),
        }));
      },
    );
  }

  async function reloadTeacherScores() {
    const teacherScores = await requestJson(`${auth.apiBase}/teacher-scores`, { headers });
    setState((current) => ({ ...current, teacherScores }));
  }

  async function createTeacherScoreEvent(teacherId, payload) {
    return runAction(
      `score-${teacherId}`,
      () =>
        requestJson(`${auth.apiBase}/teachers/${teacherId}/score-events`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }),
      message("Updated score for {p0}.", { p0: teacherId }),
      () => {
        reloadTeacherScores();
      },
    );
  }

  async function markScoreEventRead(eventId) {
    await requestJson(`${auth.apiBase}/teacher-events/${eventId}/read`, {
      method: "PUT",
      headers,
    });
    setState((current) => ({
      ...current,
      unreadScoreEvents: current.unreadScoreEvents.filter((item) => item.event_id !== eventId),
    }));
  }

  async function markAllScoreEventsRead() {
    await requestJson(`${auth.apiBase}/teacher-events/read-all`, {
      method: "PUT",
      headers,
    });
    setState((current) => ({
      ...current,
      unreadScoreEvents: [],
    }));
  }

  async function markManagerEventRead(requestId) {
    await requestJson(`${auth.apiBase}/manager-events/${requestId}/read`, {
      method: "PUT",
      headers,
    });
    setState((current) => ({
      ...current,
      unreadManagerEvents: current.unreadManagerEvents.filter((item) => item.request_id !== requestId),
    }));
  }

  async function markAllManagerEventsRead() {
    await requestJson(`${auth.apiBase}/manager-events/read-all`, {
      method: "PUT",
      headers,
    });
    setState((current) => ({
      ...current,
      unreadManagerEvents: [],
    }));
  }

  const unassignedClasses = state.classes.filter((item) => item.status !== "ASSIGNED");
  const managerUsers = state.users.filter((item) => item.role === "manager");
  const centersById = new Map(state.centers.map((item) => [item.center_id, item]));
  const formatCenter = (centerId) => {
    const center = centersById.get(centerId);
    return center ? `${center.name} (${center.center_id})` : centerId || "-";
  };
  const classesWithCenter = state.classes.map((item) => ({
    ...item,
    center_label: formatCenter(item.center_id),
  }));
  const teachersById = new Map(state.teachers.map((item) => [item.teacher_id, item.name]));
  const classesWithCenterAndTeacher = classesWithCenter.map((item) => ({
    ...item,
    teacher_label:
      item.teacher_labels?.length > 0
        ? item.teacher_labels
            .map((label) => String(label).replace(/^[^-]+ - /, ""))
            .join(", ")
        : item.teacher_id
          ? teachersById.get(item.teacher_id) || "-"
          : "-",
  }));
  const highlightedClasses = classesWithCenterAndTeacher.filter((item) =>
    item.teacher_ids?.length > 0 ? item.teacher_ids.includes(user.teacher_id) : item.teacher_id === user.teacher_id,
  );
  const classesById = new Map(state.classes.map((item) => [item.class_id, item]));
  const leaveRequestsWithCenter = state.leaveRequests.map((item) => ({
    ...item,
    center_id: formatCenter(classesById.get(item.class_id)?.center_id),
    teacher_name: teachersById.get(item.teacher_id) || item.teacher_id || "-",
  }));
  const assignmentQueue = classesWithCenterAndTeacher;
  const currentTeacherScore =
    state.teacherScores.find((item) => item.teacher_id === user.teacher_id) || {
      score: 100,
      max_score: 110,
      event_count: 0,
    };
	  const notifications =
	    user.role === "manager"
	      ? state.unreadManagerEvents.map((item) => ({
	          id: item.request_id,
	          title: t("leaveRequestAssigned"),
	          message: t("leaveRequestAssignedMessage", {
	            teacher: item.teacher_name || item.teacher_id,
	            classId: item.class_id,
	            reason: item.reason,
	          }),
	          createdAt: formatDateTimeValue(item.created_at),
	          unread: !item.manager_read_at,
	        }))
	      : state.unreadScoreEvents.map((item) => ({
	          id: item.event_id,
	          title: item.event_type === "PROFILE" ? t("teacherProfileUpdated") : t("scoreUpdated"),
	          message:
	            item.event_type === "PROFILE"
	              ? `${item.reason}. ${item.evidence_text || ""}`
	              : t("scoreUpdatedMessage", {
	                  delta: `${item.delta > 0 ? "+" : ""}${item.delta}`,
	                  reason: item.reason,
	                  evidence: item.evidence_text || "",
	                }),
          evidenceUrl: item.evidence_url,
          createdAt: formatDateTimeValue(item.created_at),
          unread: !item.teacher_read_at,
        }));

  return (
    <main className="dashboard-shell">
      <section className="dashboard-card dashboard-card-wide">
        <ChessHeader name={user.display_name || user.user_code} role={user.role}>
          <div className="dashboard-actions">
            <NotificationBell
              notifications={notifications}
              onMarkAllRead={
                user.role === "teacher"
                  ? markAllScoreEventsRead
                  : user.role === "manager"
                    ? markAllManagerEventsRead
                    : undefined
              }
              onMarkRead={
                user.role === "teacher"
                  ? markScoreEventRead
                  : user.role === "manager"
                    ? markManagerEventRead
                    : undefined
              }
            />
            <LanguageToggle />
            <WebPushControl auth={auth} />
            <div className="account-chip">
              <UserAvatar
                apiBase={auth.apiBase}
                imageUrl={user.profile_image_url}
                name={user.display_name}
                fallbackCode={user.user_code}
                size="medium"
              />
              <div className="account-chip-copy">
                <strong>{getRoleTitle(user.role, t)}</strong>
                <span>{user.user_code}</span>
                {user.role === "teacher" ? <span>{user.teacher_id || "-"}</span> : null}
              </div>
            </div>
            <div className="dashboard-action-stack">
              <button type="button" className="secondary-button" onClick={auth.logout}>
                {t("logout")}
              </button>
              <Link className="inline-link" to="/profile-settings">
                {t("profileSettings")}
              </Link>
              {(user.role === "developer" || user.role === "manager") && (
                <Link className="inline-link" to="/register">
                  {t("openRegisterScreen")}
                </Link>
              )}
            </div>
          </div>
        </ChessHeader>

        {state.error ? <div className="status error">{state.error}</div> : null}

        {state.isLoading ? (
          <div className="page-status compact">{t("loadingMonitorData")}</div>
        ) : user.role === "teacher" ? (
          <TeacherMonitorView
            teacherId={user.teacher_id}
            highlightedClasses={highlightedClasses}
            attendanceRecords={state.attendanceRecords}
            leaveRequestManagers={state.leaveRequestManagers}
            leaveRequests={leaveRequestsWithCenter}
            unassignedCount={unassignedClasses.length}
            pendingAction={pendingAction}
            actionStatus={actionStatus}
            teacherScore={currentTeacherScore}
            onCheckInAttendance={checkInAttendance}
            onCheckOutAttendance={checkOutAttendance}
            onCreateLeaveRequest={createLeaveRequest}
            onCancelLeaveRequest={cancelLeaveRequest}
          />
        ) : (
          <AdminMonitorView
            actionStatus={actionStatus}
            attendanceRecords={state.attendanceRecords}
            apiBase={auth.apiBase}
            token={auth.token}
            classes={classesWithCenterAndTeacher}
            centers={state.centers}
            leaveRequests={leaveRequestsWithCenter}
            managerUsers={managerUsers}
            pendingAction={pendingAction}
            replacementQueue={assignmentQueue}
            replacementSuggestions={replacementSuggestions}
            resetRequests={state.resetRequests}
            role={user.role}
            teacherScores={state.teacherScores}
            teachers={state.teachers}
            onApproveLeaveRequest={approveLeaveRequest}
            onAssignReplacement={assignReplacement}
            onRemoveClassTeacher={removeClassTeacher}
            onReassignClassTeacher={reassignClassTeacher}
            onRestorePermanentClassTeacher={restorePermanentClassTeacher}
            onRejectLeaveRequest={rejectLeaveRequest}
            onLoadReplacementSuggestions={loadReplacementSuggestions}
            onResetPasswordRequest={resetPasswordRequest}
            onUpdateTeacherActive={updateTeacherActive}
            onUpdateTeacherProfile={updateTeacherProfile}
            onDeleteTeacherProfileImage={deleteTeacherProfileImage}
            onCreateTeacherScoreEvent={createTeacherScoreEvent}
            onCreateManualAttendance={createManualAttendance}
            onUpdateClassTime={updateClassTime}
          />
        )}
      </section>
    </main>
  );
}

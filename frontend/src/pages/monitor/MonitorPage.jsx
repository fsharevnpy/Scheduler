import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

import NotificationBell from "../../components/NotificationBell.jsx";
import UserAvatar from "../../components/UserAvatar.jsx";
import { getRoleTitle } from "../../lib/roles.js";
import { requestJson } from "../../lib/http.js";
import AdminMonitorView from "./AdminMonitorView.jsx";
import TeacherMonitorView from "./TeacherMonitorView.jsx";
import { formatDateTimeValue } from "./monitorUtils.js";

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
  });
  const [actionStatus, setActionStatus] = useState({ kind: "", message: "" });
  const [pendingAction, setPendingAction] = useState("");
  const [replacementSuggestions, setReplacementSuggestions] = useState({});

  const headers = useMemo(() => ({ Authorization: `Bearer ${auth.token}` }), [auth.token]);

  useEffect(() => {
    let cancelled = false;

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
          requestJson(`${auth.apiBase}/attendance-records`, { headers }),
          requestJson(`${auth.apiBase}/teacher-scores`, { headers }),
        ];

        if (user.role === "manager" || user.role === "developer") {
          requests.push(requestJson(`${auth.apiBase}/teachers`, { headers }));
          requests.push(requestJson(`${auth.apiBase}/password-reset-requests`, { headers }));
        }

        if (user.role === "teacher") {
          requests.push(requestJson(`${auth.apiBase}/teacher-score-events/unread`, { headers }));
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
        let users = [];

        if (user.role === "manager" || user.role === "developer") {
          teachers = results[resultIndex++] || [];
          resetRequests = results[resultIndex++] || [];
        }

        if (user.role === "teacher") {
          unreadScoreEvents = results[resultIndex++] || [];
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
          });
        }
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [auth.apiBase, headers, user.role]);

  async function runAction(actionKey, action, successMessage, onSuccess) {
    setPendingAction(actionKey);
    setActionStatus({ kind: "", message: "" });

    try {
      const result = await action();
      if (onSuccess) {
        onSuccess(result);
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
      `Approved leave request ${requestId}.`,
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
          status: item.teacher_id ? "ASSIGNED" : "OPEN",
        };
      }),
    };
  }

  async function transitionLeaveRequest(requestId, endpointAction, nextStatus, actionLabel) {
    const leaveRequest = state.leaveRequests.find((item) => item.request_id === requestId);

    await runAction(
      `${endpointAction}-${requestId}`,
      () => requestJson(`${auth.apiBase}/leave-requests/${requestId}/${endpointAction}`, { method: "PUT", headers }),
      `${actionLabel} leave request ${requestId}.`,
      () => {
        setState((current) => applyInactiveLeaveRequestStatus(current, requestId, nextStatus, leaveRequest));
      },
    );
  }

  async function rejectLeaveRequest(requestId) {
    await transitionLeaveRequest(requestId, "reject", "REJECTED", "Rejected");
  }

  async function cancelLeaveRequest(requestId) {
    await transitionLeaveRequest(requestId, "cancel", "CANCELLED", "Cancelled");
  }

  async function createLeaveRequest({ classId, requestDate, reason }) {
    const requestId = generateLeaveRequestId(state.leaveRequests);

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
            request_date: requestDate,
            reason,
            status: "REQUESTED",
          }),
        }),
      `Created leave request ${requestId}.`,
      () => {
        setState((current) => ({
          ...current,
          leaveRequests: [
            ...current.leaveRequests,
            {
              request_id: requestId,
              class_id: classId,
              teacher_id: user.teacher_id,
              request_date: requestDate,
              reason,
              status: "REQUESTED",
            },
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
      "Attendance recorded.",
      (record) => {
        setState((current) => ({
          ...current,
          attendanceRecords: [record, ...current.attendanceRecords],
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
          message: `Reset password for request ${requestId}. Default password: ${response.default_password}.`,
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

  async function loadReplacementSuggestions(classId) {
    setPendingAction(`suggest-${classId}`);
    setActionStatus({ kind: "", message: "" });

    try {
      const suggestions = await requestJson(`${auth.apiBase}/classes/${classId}/replacement-suggestions`, { headers });
      setReplacementSuggestions((current) => ({ ...current, [classId]: suggestions }));
      setActionStatus({ kind: "success", message: `Loaded replacement suggestions for ${classId}.` });
    } catch (error) {
      setActionStatus({ kind: "error", message: error.message });
    } finally {
      setPendingAction("");
    }
  }

  async function assignReplacement(classId, teacherId) {
    const success = await runAction(
      `assign-${classId}-${teacherId}`,
      () =>
        requestJson(`${auth.apiBase}/classes/${classId}/assign-replacement`, {
          method: "PUT",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ teacher_id: teacherId }),
        }),
      `Assigned replacement ${teacherId} to class ${classId}.`,
      () => {
        setState((current) => ({
          ...current,
          classes: current.classes.map((item) =>
            item.class_id === classId
              ? {
                  ...item,
                  teacher_id: teacherId,
                  status: "ASSIGNED",
                }
              : item,
          ),
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
      `Updated active status for ${teacherId}.`,
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
      `Updated teacher profile for ${teacherId}.`,
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
      `Updated score for ${teacherId}.`,
      () => {
        reloadTeacherScores();
      },
    );
  }

  async function markScoreEventRead(eventId) {
    await requestJson(`${auth.apiBase}/teacher-score-events/${eventId}/read`, {
      method: "PUT",
      headers,
    });
    setState((current) => ({
      ...current,
      unreadScoreEvents: current.unreadScoreEvents.filter((item) => item.event_id !== eventId),
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
    teacher_label: item.teacher_id ? `${item.teacher_id} - ${teachersById.get(item.teacher_id) || "-"}` : "-",
  }));
  const highlightedClasses = classesWithCenterAndTeacher.filter((item) => item.teacher_id === user.teacher_id);
  const classesById = new Map(state.classes.map((item) => [item.class_id, item]));
  const leaveRequestsWithCenter = state.leaveRequests.map((item) => ({
    ...item,
    center_id: formatCenter(classesById.get(item.class_id)?.center_id),
    teacher_name: teachersById.get(item.teacher_id) || item.teacher_id || "-",
  }));
  const assignmentQueue = classesWithCenterAndTeacher.filter(
    (item) => item.status === "OPEN" || item.status === "NEED_REPLACEMENT",
  );
  const currentTeacherScore =
    state.teacherScores.find((item) => item.teacher_id === user.teacher_id) || {
      score: 100,
      max_score: 110,
      base_score: 100,
      event_count: 0,
    };
  const notifications = state.unreadScoreEvents.map((item) => ({
    id: item.event_id,
    title: "Score updated",
    message: `${item.delta > 0 ? "+" : ""}${item.delta} points: ${item.reason}. ${item.evidence_text}`,
    evidenceUrl: item.evidence_url,
    createdAt: formatDateTimeValue(item.created_at),
    unread: !item.teacher_read_at,
  }));

  return (
    <main className="dashboard-shell">
      <section className="dashboard-card dashboard-card-wide">
        <div className="dashboard-head">
          <div>
            <p className="eyebrow">Monitor</p>
            <h1 className="dashboard-title">Welcome back, {user.display_name || user.user_code}.</h1>
            <p className="subtle">
              {user.role === "teacher"
                ? "Review your current teaching load and leave requests."
                : "Review operational data for teachers, classes, and leave requests."}
            </p>
          </div>
          <div className="dashboard-actions">
            <NotificationBell notifications={notifications} onMarkRead={user.role === "teacher" ? markScoreEventRead : undefined} />
            <div className="account-chip">
              <UserAvatar
                apiBase={auth.apiBase}
                imageUrl={user.profile_image_url}
                name={user.display_name}
                fallbackCode={user.user_code}
                size="medium"
              />
              <div className="account-chip-copy">
                <strong>{getRoleTitle(user.role)}</strong>
                <span>{user.user_code}</span>
                {user.role === "teacher" ? <span>{user.teacher_id || "-"}</span> : null}
              </div>
            </div>
            <div className="dashboard-action-stack">
              <button type="button" className="secondary-button" onClick={auth.logout}>
                Log out
              </button>
              <Link className="inline-link" to="/profile-settings">
                Profile Settings
              </Link>
              {(user.role === "developer" || user.role === "manager") && (
                <Link className="inline-link" to="/register">
                  Open register screen
                </Link>
              )}
            </div>
          </div>
        </div>

        {state.error ? <div className="status error">{state.error}</div> : null}

        {state.isLoading ? (
          <div className="page-status compact">Loading monitor data...</div>
        ) : user.role === "teacher" ? (
          <TeacherMonitorView
            highlightedClasses={highlightedClasses}
            attendanceRecords={state.attendanceRecords}
            leaveRequests={leaveRequestsWithCenter}
            unassignedCount={unassignedClasses.length}
            pendingAction={pendingAction}
            actionStatus={actionStatus}
            teacherScore={currentTeacherScore}
            onCheckInAttendance={checkInAttendance}
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
            onRejectLeaveRequest={rejectLeaveRequest}
            onLoadReplacementSuggestions={loadReplacementSuggestions}
            onResetPasswordRequest={resetPasswordRequest}
            onUpdateTeacherActive={updateTeacherActive}
            onUpdateTeacherProfile={updateTeacherProfile}
            onCreateTeacherScoreEvent={createTeacherScoreEvent}
          />
        )}
      </section>
    </main>
  );
}

import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

import UserAvatar from "../../components/UserAvatar.jsx";
import { getRoleTitle } from "../../lib/roles.js";
import { requestJson } from "../../lib/http.js";
import AdminMonitorView from "./AdminMonitorView.jsx";
import TeacherMonitorView from "./TeacherMonitorView.jsx";

export default function MonitorPage({ auth }) {
  const user = auth.user;
  const [state, setState] = useState({
    isLoading: true,
    error: "",
    centers: [],
    teachers: [],
    classes: [],
    leaveRequests: [],
    resetRequests: [],
    users: [],
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
        ];

        if (user.role === "manager" || user.role === "developer") {
          requests.push(requestJson(`${auth.apiBase}/teachers`, { headers }));
          requests.push(requestJson(`${auth.apiBase}/password-reset-requests`, { headers }));
        }

        if (user.role === "developer") {
          requests.push(requestJson(`${auth.apiBase}/users`, { headers }));
        }

        const results = await Promise.all(requests);
        const [centers, classes, leaveRequests, teachers = [], resetRequests = [], users = []] = results;

        if (!cancelled) {
          setState({
            isLoading: false,
            error: "",
            centers,
            teachers,
            classes,
            leaveRequests,
            resetRequests,
            users,
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
            resetRequests: [],
            users: [],
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
      await action();
      if (onSuccess) {
        onSuccess();
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

  async function cancelLeaveRequest(requestId) {
    const leaveRequest = state.leaveRequests.find((item) => item.request_id === requestId);

    await runAction(
      `cancel-${requestId}`,
      () => requestJson(`${auth.apiBase}/leave-requests/${requestId}/cancel`, { method: "PUT", headers }),
      `Cancelled leave request ${requestId}.`,
      () => {
        setState((current) => {
          const nextLeaveRequests = current.leaveRequests.map((item) =>
            item.request_id === requestId ? { ...item, status: "CANCELLED" } : item,
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
        });
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
            leaveRequests={leaveRequestsWithCenter}
            teacherId={user.teacher_id}
            unassignedCount={unassignedClasses.length}
          />
        ) : (
          <AdminMonitorView
            actionStatus={actionStatus}
            apiBase={auth.apiBase}
            classes={classesWithCenterAndTeacher}
            leaveRequests={leaveRequestsWithCenter}
            managerUsers={managerUsers}
            pendingAction={pendingAction}
            replacementQueue={assignmentQueue}
            replacementSuggestions={replacementSuggestions}
            resetRequests={state.resetRequests}
            role={user.role}
            teachers={state.teachers}
            onApproveLeaveRequest={approveLeaveRequest}
            onAssignReplacement={assignReplacement}
            onCancelLeaveRequest={cancelLeaveRequest}
            onLoadReplacementSuggestions={loadReplacementSuggestions}
            onResetPasswordRequest={resetPasswordRequest}
            onUpdateTeacherActive={updateTeacherActive}
          />
        )}
      </section>
    </main>
  );
}

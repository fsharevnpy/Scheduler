import { useEffect, useMemo, useState } from "react";

import { requestJson } from "../lib/http.js";
import { useLanguage } from "../lib/i18n.jsx";
import { buildManagerEventsWebSocketUrl, buildTeacherEventsWebSocketUrl } from "../lib/teacherEvents.js";
import { formatDateTimeValue } from "../pages/monitor/monitorUtils.js";
import NotificationBell from "./NotificationBell.jsx";

function mapTeacherEvent(item, t) {
  return {
    id: item.event_id,
    title: item.event_type === "PROFILE" ? t("teacherProfileUpdated") : t("scoreUpdated"),
    message:
      item.event_type === "PROFILE"
        ? `${item.reason}. ${item.evidence_text || ""}`
        : t("scoreUpdatedMessage", {
            delta: `${item.delta > 0 ? "+" : ""}${item.delta}`,
            reason: item.reason,
            evidence: item.evidence_text,
          }),
    evidenceUrl: item.evidence_url,
    createdAt: formatDateTimeValue(item.created_at),
    unread: !item.teacher_read_at,
  };
}

function mapManagerEvent(item, t) {
  return {
    id: item.request_id,
    title: t("leaveRequestAssigned"),
    message: t("leaveRequestAssignedMessage", {
      teacher: item.teacher_name || item.teacher_id,
      classId: item.class_id,
      reason: item.reason,
    }),
    createdAt: formatDateTimeValue(item.created_at),
    unread: !item.manager_read_at,
  };
}

export default function AppNotificationBell({ auth }) {
  const [teacherEvents, setTeacherEvents] = useState([]);
  const [managerEvents, setManagerEvents] = useState([]);
  const role = auth.user?.role;
  const { t } = useLanguage();

  const headers = useMemo(() => ({ Authorization: `Bearer ${auth.token}` }), [auth.token]);

  useEffect(() => {
    let cancelled = false;

    async function loadNotifications() {
      if (!auth.token || (role !== "teacher" && role !== "manager")) {
        setTeacherEvents([]);
        setManagerEvents([]);
        return;
      }

      try {
        if (role === "teacher") {
          const data = await requestJson(`${auth.apiBase}/teacher-events/unread`, { headers });
          if (!cancelled) {
            setTeacherEvents(data);
          }
          return;
        }

        const data = await requestJson(`${auth.apiBase}/manager-events/unread`, { headers });
        if (!cancelled) {
          setManagerEvents(data);
        }
      } catch {
        if (!cancelled) {
          setTeacherEvents([]);
          setManagerEvents([]);
        }
      }
    }

    loadNotifications();
    return () => {
      cancelled = true;
    };
  }, [auth.apiBase, auth.token, headers, role]);

  useEffect(() => {
    if (!auth.token || role !== "teacher") {
      return undefined;
    }

    let socket = null;
    let reconnectTimer = null;
    let isClosedByEffect = false;

    function connect() {
      socket = new WebSocket(buildTeacherEventsWebSocketUrl(auth.apiBase, auth.token));

      socket.onmessage = (message) => {
        const payload = JSON.parse(message.data);
        if (payload.type !== "teacher_event" || !payload.event) {
          return;
        }

        setTeacherEvents((current) => {
          const exists = current.some((item) => item.event_id === payload.event.event_id);
          return exists ? current : [payload.event, ...current];
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
  }, [auth.apiBase, auth.token, role]);

  useEffect(() => {
    if (!auth.token || role !== "manager") {
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

        setManagerEvents((current) => {
          const exists = current.some((item) => item.request_id === payload.event.request_id);
          return exists ? current : [payload.event, ...current];
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
  }, [auth.apiBase, auth.token, role]);

  async function markTeacherEventRead(eventId) {
    await requestJson(`${auth.apiBase}/teacher-events/${eventId}/read`, {
      method: "PUT",
      headers,
    });
    setTeacherEvents((current) => current.filter((item) => item.event_id !== eventId));
  }

  async function markAllTeacherEventsRead() {
    await requestJson(`${auth.apiBase}/teacher-events/read-all`, {
      method: "PUT",
      headers,
    });
    setTeacherEvents([]);
  }

  async function markManagerEventRead(requestId) {
    await requestJson(`${auth.apiBase}/manager-events/${requestId}/read`, {
      method: "PUT",
      headers,
    });
    setManagerEvents((current) => current.filter((item) => item.request_id !== requestId));
  }

  async function markAllManagerEventsRead() {
    await requestJson(`${auth.apiBase}/manager-events/read-all`, {
      method: "PUT",
      headers,
    });
    setManagerEvents([]);
  }

  if (role === "teacher") {
    return (
      <NotificationBell
        notifications={teacherEvents.map((event) => mapTeacherEvent(event, t))}
        onMarkAllRead={markAllTeacherEventsRead}
        onMarkRead={markTeacherEventRead}
      />
    );
  }

  if (role === "manager") {
    return (
      <NotificationBell
        notifications={managerEvents.map((event) => mapManagerEvent(event, t))}
        onMarkAllRead={markAllManagerEventsRead}
        onMarkRead={markManagerEventRead}
      />
    );
  }

  return <NotificationBell notifications={[]} />;
}

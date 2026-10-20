import React, { lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { LanguageProvider } from "../src/lib/i18n.jsx";
import MonitorPage from "../src/pages/monitor/MonitorPage.jsx";
import AsyncContent from "../src/components/AsyncContent.jsx";
import "../src/styles/base.css";
import "../src/styles/layout.css";
import "../src/styles/forms.css";
import "../src/styles/dashboard.css";
import "../src/styles/theme.css";
import "../src/styles/chessfighters.css";
import "../src/styles/responsive.css";

const params = new URLSearchParams(location.search);
const role = params.get("role") || "developer";
const apiBase = "/loading-demo-api";
const originalFetch = globalThis.fetch;
const NativeWebSocket = globalThis.WebSocket;
globalThis.monitorLoadRequests = [];
globalThis.WebSocket = class extends NativeWebSocket {
  constructor(url, ...options) {
    if (new URL(url).pathname.startsWith(`${apiBase}/`)) return { close() {} };
    super(url, ...options);
  }
};

const datasets = {
  "/centers": [{ center_id: "CS1", name: "Demo Center" }],
  "/classes": [],
  "/teachers": [{ teacher_id: "T1", name: "Demo Teacher", active: true }],
  "/leave-requests": [],
  "/teacher-scores": [],
  "/password-reset-requests": [],
  "/users": [],
  "/teacher-events/unread": [],
  "/manager-events/unread": [],
  "/leave-request-managers": [],
};
if (params.has("capacityFixture")) {
  datasets["/classes"] = [{
    class_id: "C1", center_id: "CS1", day_of_week: "T2", start_time: "08:00:00", end_time: "09:00:00",
    teacher_id: "T1", teacher_ids: ["T1", "T2"], teacher_count: 2, max_teachers: 2, status: "ASSIGNED",
  }];
  datasets["/teachers"].push({ teacher_id: "T2", name: "Second Teacher", active: true });
}
if (params.has("temporaryFixture")) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const assignment = { teacher_id: "T2", teacher_name: "Temporary Teacher", original_teacher_id: "T9", effective_date: today };
  datasets["/classes"] = [{
    class_id: "C1", center_id: "CS1", day_of_week: "T4", start_time: "08:00:00", end_time: "09:00:00",
    teacher_id: "T1", teacher_ids: ["T1", "T2"], teacher_labels: ["T1 - Demo Teacher", "T2 - Temporary Teacher"],
    teacher_assignment_modes: ["PERMANENT", "TEMPORARY"], original_teacher_ids: ["T1", "T9"],
    teacher_count: 2, max_teachers: 2, status: "ASSIGNED",
    temporary_assignments: [assignment, { ...assignment, effective_date: "2099-10-28" }],
  }];
}
const records = Array.from({ length: 501 }, (_, index) => ({
  record_id: `event-${index}`, teacher_id: "T1", user_code: "TC-DEMO",
  checked_at: "2026-10-19T02:00:00Z", event_type: "CHECK_IN",
}));

globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input, location.origin);
  if (!url.pathname.startsWith(`${apiBase}/`)) return originalFetch(input, options);
  const path = url.pathname.slice(apiBase.length);
  const request = { path, method: options.method || "GET", body: options.body, aborted: false, completed: false };
  globalThis.monitorLoadRequests.push(request);
  await new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      request.aborted = true;
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      options.signal?.removeEventListener("abort", abort);
      resolve();
    }, params.get("fail") === path ? 1 : Number(params.get("delay") || 100));
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener("abort", abort, { once: true });
  });
  request.completed = true;
  if (params.get("fail") === path) return Response.json({ detail: "Demo loading failure" }, { status: 503 });
  if (params.has("capacityFixture") && path === "/classes/C1" && options.method === "PUT") {
    const payload = JSON.parse(options.body);
    const item = datasets["/classes"][0];
    if (!Number.isInteger(payload.max_teachers) || payload.max_teachers < item.teacher_count) {
      return Response.json({ detail: "remove assigned teachers before reducing the teacher limit" }, { status: 400 });
    }
    item.max_teachers = payload.max_teachers;
    return Response.json({ message: "class updated", class_id: item.class_id });
  }
  if (path === "/attendance-records") {
    return Response.json(url.searchParams.has("before_record_id") ? records.slice(500) : records.slice(0, 500));
  }
  if (path in datasets) return Response.json(datasets[path]);
  return Response.json({ detail: `Unmocked request: ${path}` }, { status: 400 });
};

const root = createRoot(document.getElementById("root"));
const FailedView = lazy(() => Promise.reject(new Error("Demo view unavailable")));
globalThis.unmountMonitorDemo = () => root.unmount();
root.render(<React.StrictMode><BrowserRouter><LanguageProvider>
  {params.get("fail") === "module" ? <AsyncContent><FailedView /></AsyncContent> : <MonitorPage auth={{
    apiBase, token: "demo-only", user: { role, teacher_id: "T1", user_code: "TC-DEMO", display_name: "Demo Teacher" },
    logout() {},
  }} />}
</LanguageProvider></BrowserRouter></React.StrictMode>);

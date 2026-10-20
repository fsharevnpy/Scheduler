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
const records = Array.from({ length: 501 }, (_, index) => ({
  record_id: `event-${index}`, teacher_id: "T1", user_code: "TC-DEMO",
  checked_at: "2026-10-19T02:00:00Z", event_type: "CHECK_IN",
}));

globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input, location.origin);
  if (!url.pathname.startsWith(`${apiBase}/`)) return originalFetch(input, options);
  const path = url.pathname.slice(apiBase.length);
  const request = { path, aborted: false, completed: false };
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

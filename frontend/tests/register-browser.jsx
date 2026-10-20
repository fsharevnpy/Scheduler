import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { LanguageProvider } from "../src/lib/i18n.jsx";
import RegisterPage from "../src/pages/register/RegisterPage.jsx";
import "../src/styles/base.css";
import "../src/styles/layout.css";
import "../src/styles/forms.css";
import "../src/styles/login.css";
import "../src/styles/dashboard.css";
import "../src/styles/theme.css";
import "../src/styles/chessfighters.css";
import "../src/styles/responsive.css";

const classes = [{ class_id: "C1", center_id: "CS1", day_of_week: "T2", start_time: "07:00:00", end_time: "08:30:00", teacher_id: "T1", status: "ASSIGNED" }];
const originalFetch = globalThis.fetch;
globalThis.registerDemoRequests = [];
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input, location.origin);
  if (!url.pathname.startsWith("/register-demo-api/")) return originalFetch(input, options);
  const path = url.pathname.slice("/register-demo-api".length);
  const method = options.method || "GET";
  const payload = options.body ? JSON.parse(options.body) : null;
  globalThis.registerDemoRequests.push({ path, method, payload });
  if (globalThis.registerDemoError) {
    return Response.json({ detail: globalThis.registerDemoError }, { status: 400 });
  }
  if (path === "/classes" && method === "GET") return Response.json(classes);
  if (path === "/users" && method === "POST") return Response.json({
    user_code: "TC-DEMO", teacher_id: payload.role === "teacher" ? "T-DEMO" : null,
    role: payload.role, display_name: payload.name || payload.display_name,
  });
  return Response.json({ detail: `Unexpected demo request: ${method} ${path}` }, { status: 400 });
};
const auth = {
  apiBase: "/register-demo-api", token: "demo-only",
  user: { role: "developer", user_code: "DEMO", display_name: "Demo" },
  logout: () => { globalThis.registerDemoLogout = true; },
};
const root = createRoot(document.getElementById("root"));
root.render(
  <BrowserRouter><LanguageProvider><RegisterPage auth={auth} /></LanguageProvider></BrowserRouter>,
);
if (import.meta.hot) import.meta.hot.dispose(() => {
  globalThis.fetch = originalFetch;
  root.unmount();
});

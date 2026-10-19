import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { LanguageProvider, useLanguage } from "../src/lib/i18n.jsx";
import LanguageToggle from "../src/components/LanguageToggle.jsx";
import ChessHeader from "../src/components/ChessHeader.jsx";
import UserAvatar from "../src/components/UserAvatar.jsx";
import NotificationBell from "../src/components/NotificationBell.jsx";
import AdminMonitorView from "../src/pages/monitor/AdminMonitorView.jsx";
import TeacherMonitorView from "../src/pages/monitor/TeacherMonitorView.jsx";
import DataTable from "../src/pages/monitor/DataTable.jsx";
import { getAttendanceDateKey } from "../src/pages/monitor/attendanceUtils.js";
import "../src/styles/base.css";
import "../src/styles/layout.css";
import "../src/styles/forms.css";
import "../src/styles/login.css";
import "../src/styles/dashboard.css";
import "../src/styles/theme.css";
import "../src/styles/chessfighters.css";
import "../src/styles/responsive.css";

const day = (offset) => getAttendanceDateKey(new Date(Date.now() - offset * 86400000));
const checkIn = {
  record_id: "in", teacher_id: "T1", user_code: "TC00001", class_id: "C1",
  event_type: "CHECK_IN", checked_at: `${day(1)}T09:00:00+07:00`,
  status: "VALID", attendance_status: "ON_TIME", display_name: "Old Teacher",
};
const records = [
  checkIn,
  { ...checkIn, record_id: "out", event_type: "CHECK_OUT", checked_at: `${day(1)}T10:00:00+07:00`, attendance_status: "COMPLETED" },
  { ...checkIn, record_id: "other", checked_at: `${day(2)}T09:00:00+07:00`, class_id: "C2", display_name: "Other Day Teacher" },
  { ...checkIn, record_id: "unmatched", checked_at: `${day(3)}T09:00:00+07:00`, class_id: null, status: "INVALID", attendance_status: "UNMATCHED", display_name: "Unmatched Teacher" },
];
const status = { kind: "", message: "" };
const classes = [{ class_id: "C1", center_id: "CS1", day_of_week: "T2", start_time: "12:00:00", end_time: "13:00:00", teacher_ids: ["T2"] }];

if (new URLSearchParams(location.search).has("reportFixture")) {
  const originalFetch = globalThis.fetch;
  globalThis.attendanceReportRequests = [];
  globalThis.attendanceReportDelay = 0;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input, location.origin);
    if (!url.pathname.startsWith("/api/attendance-records/")) return originalFetch(input, options);
    globalThis.attendanceReportRequests.push(url.pathname + url.search);
    await new Promise((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
      const timer = setTimeout(() => { options.signal?.removeEventListener("abort", abort); resolve(); }, globalThis.attendanceReportDelay);
      if (options.signal?.aborted) abort();
      else options.signal?.addEventListener("abort", abort, { once: true });
    });
    if (url.pathname.endsWith("/export")) return new Response("Browser download fixture; workbook content is tested in backend tests.");
    return Response.json({
      summary: [{ teacher_id: "T2", teacher_name: "New Assignee", recorded_sessions: 2,
        confirmed_sessions: 1, warning_sessions: 1, invalid_sessions: 0, unverified_events: 0, confirmed_minutes: 90 }],
      sessions: [{ teacher_id: "T2", date: "2024-02-29", class_id: "C1", center: "CS1", block_size: 2,
        start_time: "07:00:00", end_time: "08:30:00", checked_at: "2024-02-29T07:05:00+07:00",
        check_out_at: "2024-02-29T11:00:00+07:00", result: "WARNING", warnings: ["LATE"], notes: [] }],
    });
  };
  if (import.meta.hot) import.meta.hot.dispose(() => { globalThis.fetch = originalFetch; });
}

function FixtureHeader() {
  const { t } = useLanguage();
  return (
    <ChessHeader name="Chess Fighters" role="manager">
      <div className="dashboard-actions">
        <NotificationBell notifications={[]} />
        <LanguageToggle />
        <div className="account-chip">
          <UserAvatar name="Chess Fighters" fallbackCode="CF" size="medium" />
          <div className="account-chip-copy"><strong>{t("operationsManager")}</strong><span>CF-DEMO</span></div>
        </div>
        <div className="dashboard-action-stack">
          <button type="button" className="secondary-button">{t("logout")}</button>
          <a className="inline-link" href="#teacher">{t("profileSettings")}</a>
          <a className="inline-link" href="#admin">{t("openRegisterScreen")}</a>
        </div>
      </div>
    </ChessHeader>
  );
}

function Fixture() {
  const [rows, setRows] = useState(() => Array.from({ length: 21 }, (_, index) => ({ id: `row-${index}`, name: `Entry ${index}` })));
  return (
    <LanguageProvider>
      <main className="dashboard-shell"><div className="dashboard-card dashboard-card-wide">
      <FixtureHeader />
      <section id="admin">
        <AdminMonitorView
          actionStatus={status} attendanceRecords={records} classes={classes}
          apiBase="/api" token="fixture"
          teachers={[{ teacher_id: "T2", name: "New Assignee" }]} centers={[]}
          leaveRequests={[]} managerUsers={[]} replacementQueue={[]}
          replacementSuggestions={{}} resetRequests={[]} role="manager" teacherScores={[]}
        />
      </section>
      <section id="teacher">
        <TeacherMonitorView
          teacherId="T1" highlightedClasses={[]} attendanceRecords={records}
          leaveRequests={[]} unassignedCount={0} actionStatus={status}
        />
      </section>
      <section id="pagination">
        <button onClick={() => setRows((current) => current.map((row) => ({ ...row })))}>Refresh rows</button>
        <DataTable title="Pagination regression" columns={[{ key: "name", label: "Name" }]}
          rows={rows} pageSize={10} resetPageOnRowsChange={false} />
      </section>
      </div></main>
    </LanguageProvider>
  );
}

const root = createRoot(document.getElementById("root"));
root.render(<Fixture />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());

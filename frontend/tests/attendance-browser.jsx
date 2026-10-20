import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { LanguageProvider, useLanguage } from "../src/lib/i18n.jsx";
import LanguageToggle from "../src/components/LanguageToggle.jsx";
import ChessHeader from "../src/components/ChessHeader.jsx";
import NotificationBell from "../src/components/NotificationBell.jsx";
import AccountMenu from "../src/components/AccountMenu.jsx";
import AdminMonitorView from "../src/pages/monitor/AdminMonitorView.jsx";
import TeacherMonitorView from "../src/pages/monitor/TeacherMonitorView.jsx";
import DataTable from "../src/pages/monitor/DataTable.jsx";
import { getAttendanceDateKey, getAttendanceDayCode, formatAttendanceTime, getTeacherAttendanceAvailability } from "../src/pages/monitor/attendanceUtils.js";
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

if (new URLSearchParams(location.search).get("view") === "teacher") {
  const original = Object.getOwnPropertyDescriptor(navigator, "geolocation");
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition(success) {
        setTimeout(() => success({ coords: { latitude: 10.77, longitude: 106.69, accuracy: 8 } }), 350);
      },
    },
  });
  if (import.meta.hot) import.meta.hot.dispose(() => {
    if (original) Object.defineProperty(navigator, "geolocation", original);
    else delete navigator.geolocation;
  });
}

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
        check_out_at: "2024-02-29T11:00:00+07:00", result: "WARNING", warnings: ["LATE"], notes: [],
        student_count: null, student_names: null, session_students: [
          { class_id: "C1", start_time: "07:00:00", end_time: "08:30:00", student_count: 2, student_names: ["Demo An", "Demo Bình"] },
          { class_id: "C2", start_time: "08:30:00", end_time: "11:00:00", student_count: 1, student_names: ["Demo Chi"] },
        ] }],
    });
  };
  if (import.meta.hot) import.meta.hot.dispose(() => { globalThis.fetch = originalFetch; });
}

function FixtureHeader({ teacherOnly }) {
  return (
    <ChessHeader name="Chess Fighters" role={teacherOnly ? "teacher" : "manager"}>
      <div className="dashboard-actions">
        <NotificationBell notifications={[]} />
        <LanguageToggle />
        <AccountMenu auth={{
          apiBase: "/api", token: "", user: { display_name: "Chess Fighters", user_code: "CF-DEMO", role: teacherOnly ? "teacher" : "manager", teacher_id: teacherOnly ? "T1" : null },
          logout: () => { globalThis.fixtureLogout = true; },
        }} />
      </div>
    </ChessHeader>
  );
}

function FixtureNotice() {
  const { language } = useLanguage();
  return <p className="subtle" role="status">{language === "vi"
    ? "Bản thử nghiệm dành cho giáo viên. Vị trí được giả lập, dữ liệu không lưu vào hệ thống thật."
    : "Teacher demo. Location is simulated; no data is saved to the live system."}</p>;
}

function Fixture() {
  const teacherOnly = new URLSearchParams(location.search).get("view") === "teacher";
  const managerOnly = ["manager", "developer"].includes(new URLSearchParams(location.search).get("view"));
  const role = new URLSearchParams(location.search).get("view") === "developer" ? "developer" : "manager";
  const scenario = new URLSearchParams(location.search).get("scenario") || "scheduled";
  const hour = Math.min(Number(formatAttendanceTime(new Date()).slice(0, 2)), 20);
  const clock = (value) => `${String(value).padStart(2, "0")}:00:00`;
  const demoBlock = [
    { class_id: "DEMO1", center_id: "CS1", start_time: clock(hour), end_time: clock(hour + 1) },
    { class_id: "DEMO2", center_id: "CS1", start_time: clock(hour + 1), end_time: hour >= 20 ? "23:59:59" : clock(hour + 2) },
  ].slice(0, scenario === "single" ? 1 : 2);
  const teacherClasses = ["unassigned", "reassigned"].includes(scenario) ? [] : demoBlock.map((item) => ({
    ...item, teacher_id: "T1", teacher_ids: ["T1"], status: "ASSIGNED",
    day_of_week: getAttendanceDayCode(day(0)), center_label: "Demo Center (CS1)",
  }));
  const demoCheckIn = {
    ...checkIn, record_id: "demo-in", class_id: "DEMO1", checked_at: new Date().toISOString(),
    session_class_id: "DEMO1", session_center_id: "CS1", session_start_time: demoBlock[0].start_time,
    session_end_time: demoBlock[0].end_time, session_block: demoBlock, nearest_center_name: "Demo Center",
  };
  const [rows, setRows] = useState(() => Array.from({ length: 21 }, (_, index) => ({ id: `row-${index}`, name: `Entry ${index}` })));
  const [attendance, setAttendance] = useState(() => [
    ...records,
    ...((teacherOnly && ["teaching", "reassigned"].includes(scenario)) || new URLSearchParams(location.search).has("studentFixture") ? [demoCheckIn] : []),
    ...(teacherOnly && new URLSearchParams(location.search).has("historyFixture")
      ? Array.from({ length: 12 }, (_, index) => ({ ...checkIn, record_id: `history-${index}`, checked_at: `${day(index + 4)}T09:00:00+07:00` })) : []),
  ]);
  const [teacherLeaveRequests, setTeacherLeaveRequests] = useState([]);
  const classFixture = new URLSearchParams(location.search).has("classFixture");
  const [managerClasses, setManagerClasses] = useState(classes);
  const classRows = managerClasses.map((item) => ({
    ...item, center_label: item.center_id === "CS2" ? "Empty Center (CS2)" : "Demo Center (CS1)",
    teacher_label: item.teacher_ids?.length ? "New Assignee" : "-", status: item.teacher_ids?.length ? "ASSIGNED" : "OPEN",
  }));

  async function classDemoAction(action, payload) {
    globalThis.classDemoRequests = [...(globalThis.classDemoRequests || []), { action, payload }];
    await new Promise((resolve) => setTimeout(resolve, globalThis.classDemoDelay || 0));
    if (globalThis.classDemoError) throw new Error(globalThis.classDemoError);
  }
  const [managerTeachers, setManagerTeachers] = useState(() =>
    new URLSearchParams(location.search).has("teacherSortFixture")
      ? Array.from({ length: 14 }, (_, index) => ({
        teacher_id: `T${index + 1}`, user_code: `TC${String(index + 1).padStart(5, "0")}`,
        name: `Demo Teacher ${String(index + 1).padStart(2, "0")}`, active: index % 2 === 1,
      }))
      : new URLSearchParams(location.search).has("studentFixture")
        ? [{ teacher_id: "T1", name: "Demo Teacher", active: true }]
        : [{ teacher_id: "T2", name: "New Assignee", active: true }],
  );
  const [fixtureStatus, setFixtureStatus] = useState(status);

  async function checkin(payload) {
    globalThis.checkinFixturePayload = payload;
    setFixtureStatus(status);
    setAttendance((current) => [...current, { ...demoCheckIn, record_id: `demo-in-${current.length}` }]);
    return true;
  }

  async function checkout(payload) {
    globalThis.checkoutStudentPayload = payload;
    if (globalThis.failCheckoutFixture) {
      setFixtureStatus({ kind: "error", message: "Report request failed" });
      return false;
    }
    setFixtureStatus(status);
    const { openCheckIn } = getTeacherAttendanceAvailability({ records: attendance, classes: teacherClasses, teacherId: "T1" });
    const lastShift = demoBlock[demoBlock.length - 1];
    setAttendance((current) => [...current, {
      ...checkIn, record_id: `student-out-${current.length}`, event_type: "CHECK_OUT",
      checked_at: new Date().toISOString(), attendance_status: "COMPLETED",
      check_in_record_id: openCheckIn?.record_id, class_id: lastShift.class_id,
      session_class_id: lastShift.class_id, session_center_id: "CS1", session_start_time: lastShift.start_time, session_end_time: lastShift.end_time,
      student_count: payload.studentCount, student_names: payload.studentNames,
      session_students: payload.sessionStudents,
    }]);
    return true;
  }

  return (
    <LanguageProvider>
      <main className="dashboard-shell"><div className="dashboard-card dashboard-card-wide">
      <FixtureHeader teacherOnly={teacherOnly} />
      {!teacherOnly ? <section id="admin">
        <AdminMonitorView
          actionStatus={fixtureStatus} attendanceRecords={attendance} classes={classFixture ? classRows : classes}
          apiBase="/api" token="fixture"
          teachers={managerTeachers} centers={[{ center_id: "CS1", name: "Demo Center" }, ...(classFixture ? [{ center_id: "CS2", name: "Empty Center" }] : [])]}
          leaveRequests={[]} managerUsers={[]} replacementQueue={classFixture ? classRows : []}
          replacementSuggestions={{}} resetRequests={[]} role={role} teacherScores={[]}
          onCreateManualAttendance={async (payload) => { globalThis.manualStudentPayload = payload; return true; }}
          onUpdateTeacherActive={async (teacherId, active) => {
            setManagerTeachers((current) => current.map((item) => item.teacher_id === teacherId ? { ...item, active } : item));
            return true;
          }}
          onCreateClass={async (payload) => {
            await classDemoAction("create", payload);
            setManagerClasses((current) => [...current, { ...payload, class_id: `DEMO-${Date.now()}`, teacher_ids: payload.teacher_id ? [payload.teacher_id] : [] }]);
          }}
          onDeleteClass={async (classId) => {
            await classDemoAction("delete", classId);
            setManagerClasses((current) => current.filter((item) => item.class_id !== classId));
          }}
          onUpdateClassTime={async (classId, payload) => {
            await classDemoAction("update", { classId, ...payload });
            setManagerClasses((current) => current.map((item) => item.class_id === classId ? { ...item, ...payload } : item));
            return true;
          }}
        />
      </section> : null}
      {!managerOnly ? <section id="teacher">
        <TeacherMonitorView
          teacherId="T1" highlightedClasses={teacherClasses} attendanceRecords={attendance}
          leaveRequests={teacherLeaveRequests} actionStatus={fixtureStatus}
          leaveRequestManagers={[{ user_code: "QL00001", display_name: "Demo Manager" }]}
          onCheckOutAttendance={checkout}
          onCheckInAttendance={checkin}
          onCreateLeaveRequest={async (payload) => {
            setTeacherLeaveRequests((current) => [...current, { request_id: `DEMO-LR-${current.length}`, class_id: payload.classId, reason: payload.reason, status: "REQUESTED" }]);
            return true;
          }}
          onCancelLeaveRequest={async (id) => {
            setTeacherLeaveRequests((current) => current.map((item) => item.request_id === id ? { ...item, status: "CANCELLED" } : item));
            return true;
          }}
        />
        {teacherOnly ? <FixtureNotice /> : null}
      </section> : null}
      {!teacherOnly && !managerOnly ? <section id="pagination">
        <button onClick={() => setRows((current) => current.map((row) => ({ ...row })))}>Refresh rows</button>
        <DataTable title="Pagination regression" columns={[{ key: "name", label: "Name" }]}
          rows={rows} pageSize={10} resetPageOnRowsChange={false} />
      </section> : null}
      </div></main>
    </LanguageProvider>
  );
}

const root = createRoot(document.getElementById("root"));
root.render(<BrowserRouter><Fixture /></BrowserRouter>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());

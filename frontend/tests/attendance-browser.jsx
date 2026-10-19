import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { LanguageProvider } from "../src/lib/i18n.jsx";
import AdminMonitorView from "../src/pages/monitor/AdminMonitorView.jsx";
import TeacherMonitorView from "../src/pages/monitor/TeacherMonitorView.jsx";
import DataTable from "../src/pages/monitor/DataTable.jsx";
import { getAttendanceDateKey } from "../src/pages/monitor/attendanceUtils.js";

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

function Fixture() {
  const [rows, setRows] = useState(() => Array.from({ length: 21 }, (_, index) => ({ id: `row-${index}`, name: `Entry ${index}` })));
  return (
    <LanguageProvider>
      <section id="admin">
        <AdminMonitorView
          actionStatus={status} attendanceRecords={records} classes={classes}
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
    </LanguageProvider>
  );
}

createRoot(document.getElementById("root")).render(<Fixture />);

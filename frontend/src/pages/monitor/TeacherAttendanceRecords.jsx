import { useLanguage } from "../../lib/i18n.jsx";
import { formatAttendanceDate, formatAttendanceTime, formatAttendanceWeekday } from "./attendanceUtils.js";
import { formatTimeValue } from "./monitorUtils.js";
import AttendanceStudents from "./AttendanceStudents.jsx";
import StatusPill from "./StatusPill.jsx";
import DataTable from "./DataTable.jsx";

function TeacherAttendanceCard({ row }) {
  const { t, language } = useLanguage();
  return (
    <article className="teacher-attendance-card">
      <header>
        <strong>{formatAttendanceDate(row.attendance_date)} | {formatAttendanceWeekday(row.attendance_date, language)}</strong>
        <span>{row.class_id || t("Unmatched session")}</span>
      </header>
      <p className="subtle">{row.nearest_center_name || row.center_id || "-"} | {row.start_time && row.end_time
        ? `${formatTimeValue(row.start_time)} - ${formatTimeValue(row.end_time)}` : t("Shift time not recorded")}</p>
      <div className="teacher-attendance-times">
        <div><span>{t("checkIn")}</span><strong>{formatAttendanceTime(row.checked_at)}</strong><StatusPill value={row.attendance_status || "UNMATCHED"} /></div>
        <div><span>{t("checkOut")}</span><strong>{formatAttendanceTime(row.check_out_at)}</strong><StatusPill value={row.checkout_status || "-"} /></div>
      </div>
      <div className="teacher-attendance-students">
        <span>{t("Students taught")}</span>
        <AttendanceStudents names={row.student_names} />
      </div>
      <details className="teacher-attendance-details">
        <summary>{t("Location details")}</summary>
        <p>{t("locationStatus")}: <StatusPill value={row.status || "-"} /></p>
        <p>{t("checkoutLocationStatus")}: <StatusPill value={row.checkout_location_status || "-"} /></p>
      </details>
    </article>
  );
}

export default function TeacherAttendanceRecords({ rows }) {
  const { t, language } = useLanguage();
  return (
    <DataTable title={t("attendanceRecords")} rows={rows} resetPageOnRowsChange={false}
      emptyMessage={t("noAttendanceRecords")} embedded pageSize={10}
      renderMobileCard={(row) => <TeacherAttendanceCard row={row} />}
      columns={[
        { key: "attendance_date", label: t("attendanceDate"), render: (row) => formatAttendanceDate(row.attendance_date) },
        { key: "weekday", label: t("Weekday"), render: (row) => formatAttendanceWeekday(row.attendance_date, language) },
        { key: "class_id", label: t("classId") },
        { key: "expected_shift", label: t("expectedShift"), render: (row) => row.start_time && row.end_time
          ? `${formatTimeValue(row.start_time)} - ${formatTimeValue(row.end_time)}` : "-" },
        { key: "checked_at", label: t("checkIn"), render: (row) => formatAttendanceTime(row.checked_at) },
        { key: "check_out_at", label: t("checkOut"), render: (row) => formatAttendanceTime(row.check_out_at) },
        { key: "student_names", label: t("Students taught"), render: (row) => <AttendanceStudents names={row.student_names} /> },
        { key: "nearest_center_name", label: t("location"), render: (row) =>
          (!row.checked_at && !row.check_out_at) || ["VALID", "MANUAL", "-"].includes(row.status)
            ? row.nearest_center_name || t("nearestCenter") : t("outsideValidArea") },
        { key: "status", label: t("locationStatus"), render: (row) => <StatusPill value={row.status === "-" ? "-" : row.status || "PENDING"} /> },
        { key: "attendance_status", label: t("attendanceStatus"), render: (row) => <StatusPill value={row.attendance_status || "UNMATCHED"} /> },
        { key: "checkout_status", label: t("checkOut"), render: (row) => <StatusPill value={row.checkout_status || "-"} /> },
        { key: "checkout_location_status", label: t("checkoutLocationStatus"), render: (row) => <StatusPill value={row.checkout_location_status || "-"} /> },
      ]}
    />
  );
}

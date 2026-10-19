import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../../lib/i18n.jsx";
import { requestJson } from "../../lib/http.js";
import FloatingPanel from "./FloatingPanel.jsx";
import DataTable from "./DataTable.jsx";
import ChessIcon from "../../components/ChessIcon.jsx";
import { formatAttendanceDate, formatAttendanceTime, formatAttendanceWeekday, getAttendanceDateKey } from "./attendanceUtils.js";

export function monthRange(month) {
  const [year, value] = month.split("-").map(Number);
  const end = new Date(Date.UTC(year, value, 0)).getUTCDate();
  return { start_date: `${month}-01`, end_date: `${month}-${String(end).padStart(2, "0")}` };
}

function previousMonth() {
  const [year, month] = getAttendanceDateKey().split("-").map(Number);
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
}

export default function AttendanceReportPanel({ apiBase, token, teachers, onClose }) {
  const { t, language } = useLanguage();
  const [month, setMonth] = useState(previousMonth);
  const [filters, setFilters] = useState(() => ({ ...monthRange(previousMonth()), teacher_id: "" }));
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef(null);

  useEffect(() => {
    controller.current?.abort();
    setBusy(false);
    setReport(null);
    setError("");
    return () => controller.current?.abort();
  }, [filters, language]);

  function validationError() {
    if (!filters.start_date || !filters.end_date) return t("Select both start and end dates.");
    const days = (new Date(filters.end_date) - new Date(filters.start_date)) / 86400000 + 1;
    if (days <= 0) return t("End date must be after start date.");
    if (days > 366) return t("Date range cannot exceed 366 days.");
    return "";
  }

  async function run(download) {
    const validation = validationError();
    if (validation) { setError(validation); return; }
    const request = new AbortController();
    controller.current?.abort();
    controller.current = request;
    setBusy(true);
    setError("");
    const query = new URLSearchParams({ start_date: filters.start_date, end_date: filters.end_date, language });
    if (filters.teacher_id) query.set("teacher_id", filters.teacher_id);
    const options = { headers: { Authorization: `Bearer ${token}` }, signal: request.signal };
    try {
      if (!download) {
        const result = await requestJson(`${apiBase}/attendance-records/report?${query}`, options);
        if (!request.signal.aborted) setReport(result);
      } else {
        const response = await fetch(`${apiBase}/attendance-records/export?${query}`, options);
        if (!response.ok) {
          const data = await response.json();
          throw new Error(typeof data.detail === "string" ? data.detail : t("Report request failed"));
        }
        const blob = await response.blob();
        if (request.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        const filename = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
        const teacherName = teachers.find((teacher) => teacher.teacher_id === filters.teacher_id)?.name;
        link.download = filename ? decodeURIComponent(filename) : `${teacherName || (language === "vi" ? "Tất cả giáo viên" : "All teachers")}_${filters.start_date}_${filters.end_date}.xlsx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      }
    } catch (cause) {
      if (!request.signal.aborted) setError(cause.message || t("Report request failed"));
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }

  return (
    <FloatingPanel className="attendance-report-panel" eyebrow={t("Attendance")} title={t("Export teacher report")} titleId="attendance-report-title" onClose={onClose}>
      <form lang={language} className="floating-panel-form report-filters" onSubmit={(event) => { event.preventDefault(); run(false); }}>
        <div className="floating-panel-grid">
          <label className="field"><span>{t("Teacher")}</span>
            <select value={filters.teacher_id} onChange={(event) => setFilters((current) => ({ ...current, teacher_id: event.target.value }))}>
              <option value="">{t("All teachers")}</option>
              {teachers.map((teacher) => <option key={teacher.teacher_id} value={teacher.teacher_id}>{teacher.teacher_id} - {teacher.name}</option>)}
            </select>
          </label>
          <label className="field"><span>{t("Month")}</span>
            <input type="month" value={month} onChange={(event) => {
              setMonth(event.target.value);
              if (event.target.value) setFilters((current) => ({ ...current, ...monthRange(event.target.value) }));
            }} />
          </label>
          {["start_date", "end_date"].map((field) => (
            <label className="field" key={field}><span>{t(field === "start_date" ? "Start date" : "End date")}</span>
              <input type="date" required value={filters[field]} onChange={(event) => {
                setMonth("");
                setFilters((current) => ({ ...current, [field]: event.target.value }));
              }} />
            </label>
          ))}
        </div>
        {error ? <p role="alert" className="status error">{t(error)}</p> : null}
        <div className="floating-panel-actions">
          <button type="submit" className="primary-button" disabled={busy}>{t(busy ? "Loading..." : "View statistics")}</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => run(true)}>{t("Download Excel")}</button>
        </div>
      </form>
      {report ? (
        <>
          <div className="report-highlights">
            {[
              ["recorded_sessions", "Recorded sessions", "rook"],
              ["confirmed_sessions", "Confirmed sessions", "king"],
              ["warning_sessions", "Sessions to review", "bishop"],
            ].map(([key, label, piece]) => (
              <article key={key} className={`report-highlight report-highlight-${key}`}>
                <ChessIcon piece={piece} />
                <div><span>{t(label)}</span><strong>{report.summary.reduce((sum, row) => sum + row[key], 0)}</strong></div>
              </article>
            ))}
          </div>
          <h3 className="report-summary-title">{t("Teacher summary")}</h3>
          <DataTable title={t("Teacher summary")} embedded rows={report.summary.map((row) => ({ ...row, id: row.teacher_id }))}
            emptyMessage={t("No report data.")} columns={[
              { key: "teacher_name", label: t("Teacher") },
              { key: "teacher_id", label: t("Teacher ID") },
              { key: "recorded_sessions", label: t("Recorded sessions") },
              { key: "confirmed_sessions", label: t("Confirmed sessions") },
              { key: "warning_sessions", label: t("Sessions to review") },
              { key: "invalid_sessions", label: language === "vi" ? "Ca không hợp lệ" : "Invalid sessions" },
              { key: "unverified_events", label: t("Unverified events") },
              { key: "confirmed_minutes", label: t("Confirmed minutes") },
            ]} />
          {report.summary.map((teacher) => (
            <details key={teacher.teacher_id} className="floating-panel-section report-teacher-detail">
              <summary>{teacher.teacher_name} ({teacher.teacher_id}) — {t("Details")}</summary>
              <DataTable title={t("Details")} embedded pageSize={10}
                rows={report.sessions.filter((row) => row.teacher_id === teacher.teacher_id).map((row, index) => ({ ...row, id: `${row.date}:${row.class_id}:${index}` }))}
                emptyMessage={t("No report data.")} columns={[
                  { key: "date", label: t("Date"), render: (row) => formatAttendanceDate(row.date) },
                  { key: "weekday", label: t("Weekday"), render: (row) => formatAttendanceWeekday(row.date, language) },
                  { key: "class_id", label: t("Class ID") }, { key: "center", label: t("Center") },
                  { key: "shift", label: t("Expected Shift"), render: (row) => row.start_time && row.end_time ? `${row.start_time.slice(0, 5)} - ${row.end_time.slice(0, 5)}` : "-" },
                  { key: "checked_at", label: t("Check-in"), render: (row) => formatAttendanceTime(row.checked_at) },
                  { key: "check_out_at", label: t("Checkout"), render: (row) => formatAttendanceTime(row.check_out_at) },
                  { key: "block_size", label: language === "vi" ? "Số ca trong buổi" : "Sessions in block" },
                  { key: "result", label: t("Result"), render: (row) => t(row.result) },
                  { key: "notes", label: t("Notes"), render: (row) => [...row.warnings, ...row.notes].map((code) => t(code)).join("; ") },
                ]} />
            </details>
          ))}
        </>
      ) : !busy ? (
        <div className="report-empty-state">
          <ChessIcon piece="rook" />
          <h3>{t("A clear view of every teaching session.")}</h3>
          <p>{t("Choose a teacher and period, then view statistics or download your report.")}</p>
        </div>
      ) : <p role="status" className="report-loading">{t("Loading...")}</p>}
    </FloatingPanel>
  );
}

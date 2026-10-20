import { useRef, useState } from "react";
import { useLanguage } from "../../lib/i18n.jsx";
import { formatAttendanceDayCode } from "./attendanceUtils.js";
import { formatTimeValue } from "./monitorUtils.js";
import FloatingPanel from "./FloatingPanel.jsx";

export default function ClassCapacityPanel({ item, onSave, onClose }) {
  const { t, language } = useLanguage();
  const [limit, setLimit] = useState(String(item.max_teachers ?? 2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const assigned = item.teacher_count || item.teacher_ids?.length || (item.teacher_id ? 1 : 0);

  async function submit(event) {
    event.preventDefault();
    if (saving.current) return;
    const value = Number(limit);
    if (!Number.isInteger(value) || value < 1 || value > 2147483647) {
      setError("Enter a positive whole number of teachers.");
      return;
    }
    if (value < assigned) {
      setError("remove assigned teachers before reducing the teacher limit");
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await onSave(item.class_id, value);
      onClose();
    } catch (cause) {
      setError(cause.message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <FloatingPanel eyebrow={t("Class management")} title={t("Maximum teachers")}
      titleId="class-capacity-title" onClose={onClose} closeDisabled={busy}>
      <form className="floating-panel-form" onSubmit={submit}>
        <div className="floating-panel-summary">
          <div className="floating-panel-summary-row"><span>{t("Center")}</span><strong>{item.center_label || item.center_id}</strong></div>
          <div className="floating-panel-summary-row"><span>{t("Weekday")}</span><strong>{formatAttendanceDayCode(item.day_of_week, language)}</strong></div>
          <div className="floating-panel-summary-row"><span>{t("Time")}</span><strong>{formatTimeValue(item.start_time)} – {formatTimeValue(item.end_time)}</strong></div>
          <div className="floating-panel-summary-row"><span>{t("Assigned teachers")}</span><strong>{assigned}</strong></div>
        </div>
        <label className="field"><span>{t("Maximum teachers")}</span>
          <input type="number" inputMode="numeric" min="1" max="2147483647" step="1" required
            value={limit} disabled={busy} onChange={(event) => setLimit(event.target.value)} />
        </label>
        {error ? <p className="status error" role="alert">{t(error)}</p> : null}
        <div className="floating-panel-actions">
          <button type="submit" className="table-action-button" disabled={busy}>{t(busy ? "Saving..." : "Save teacher limit")}</button>
        </div>
      </form>
    </FloatingPanel>
  );
}

import { useRef, useState } from "react";
import { useLanguage } from "../../lib/i18n.jsx";
import { formatAttendanceDayCode } from "./attendanceUtils.js";
import { formatTimeDraft, formatTimeValue } from "./monitorUtils.js";
import FloatingPanel from "./FloatingPanel.jsx";

export default function ClassActionPanel({ context, teachers, onCreate, onDelete, onClose }) {
  const { t, language } = useLanguage();
  const [form, setForm] = useState({ start_time: "", end_time: "", teacher_id: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const deleting = Boolean(context.item);

  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    if (!deleting && form.start_time >= form.end_time) {
      setError("start time must be before end time");
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      if (deleting) await onDelete(context.item.class_id);
      else await onCreate({ ...form, center_id: context.centerId, day_of_week: context.day, teacher_id: form.teacher_id || null });
      onClose();
    } catch (cause) {
      setError(cause.message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <FloatingPanel eyebrow={t("Class management")} title={t(deleting ? "Delete teaching session?" : "Create class")}
      titleId="class-action-title" onClose={onClose} closeDisabled={busy}>
      <form className="floating-panel-form" lang={language} onSubmit={submit}>
        <div className="floating-panel-summary">
          <div className="floating-panel-summary-row"><span>{t("Center")}</span><strong>{context.centerLabel}</strong></div>
          <div className="floating-panel-summary-row"><span>{t("Weekday")}</span><strong>{formatAttendanceDayCode(context.day, language)}</strong></div>
          {deleting ? <>
            <div className="floating-panel-summary-row"><span>{t("Time")}</span><strong>{formatTimeValue(context.item.start_time)} – {formatTimeValue(context.item.end_time)}</strong></div>
            <div className="floating-panel-summary-row"><span>{t("Teacher")}</span><strong>{context.item.teacher_label && context.item.teacher_label !== "-" ? context.item.teacher_label : t("unassigned")}</strong></div>
          </> : null}
        </div>
        {deleting ? <p>{t("This permanently deletes the session and its linked leave requests. Are you sure?")}</p> : <>
          <p className="subtle">{t("This session repeats every week.")}</p>
          <div className="floating-panel-grid">
            {["start_time", "end_time"].map((field) => (
              <label className="field" key={field}><span>{t(field === "start_time" ? "Start Time" : "End Time")}</span>
                <input type="text" inputMode="numeric" placeholder="HH:MM" maxLength="5" required
                  pattern="([01][0-9]|2[0-3]):[0-5][0-9]" title={t("Use 24-hour time, HH:MM from 00:00 to 23:59")}
                  disabled={busy} value={form[field]} onChange={(event) => setForm((current) => ({ ...current, [field]: formatTimeDraft(event.target.value) }))} />
              </label>
            ))}
          </div>
          <label className="field"><span>{t("Teacher")}</span>
            <select value={form.teacher_id} disabled={busy} onChange={(event) => setForm((current) => ({ ...current, teacher_id: event.target.value }))}>
              <option value="">{t("unassigned")}</option>
              {teachers.map((teacher) => <option key={teacher.teacher_id} value={teacher.teacher_id}>{teacher.teacher_id} - {teacher.name}</option>)}
            </select>
          </label>
        </>}
        {error ? <p className="status error" role="alert">{t(error)}</p> : null}
        <div className="floating-panel-actions">
          <button type="button" className="table-action-button table-action-button-muted" disabled={busy} onClick={onClose}>{t("Cancel")}</button>
          <button type="submit" className="table-action-button" disabled={busy}>{t(busy ? "Saving..." : deleting ? "Delete class" : "Create class")}</button>
        </div>
      </form>
    </FloatingPanel>
  );
}

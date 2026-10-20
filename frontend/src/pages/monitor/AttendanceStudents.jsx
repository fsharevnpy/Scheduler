import { useRef } from "react";
import { useLanguage } from "../../lib/i18n.jsx";
import { MAX_STUDENT_COUNT, studentNameSlots } from "../../lib/attendanceStudents.js";
import { formatTimeValue } from "./monitorUtils.js";

export function AttendanceStudentsFields({ count, names, onCountChange, onNamesChange, disabled, title }) {
  const { t } = useLanguage();
  const inputs = useRef([]);
  const slots = studentNameSlots(count, names);

  function focusNext(index) {
    const next = inputs.current[index + 1];
    if (next) {
      next.focus();
      next.scrollIntoView({ block: "nearest" });
    } else {
      inputs.current[index]?.blur();
    }
  }

  return (
    <fieldset className="attendance-students-fields" disabled={disabled}>
      <legend>{title || t("Students taught")}</legend>
      <label className="field">
        <span>{t("Number of students")}</span>
        <input type="number" inputMode="numeric" min="1" max={MAX_STUDENT_COUNT} step="1" required value={count}
          onChange={(event) => onCountChange(event.target.value)} />
      </label>
      {slots.map((name, index) => (
          <label key={index} className="field attendance-student-name">
            <span>{t("Student {number}", { number: index + 1 })}</span>
            <input type="text" required autoComplete="off" autoCapitalize="words"
              enterKeyHint={index < slots.length - 1 ? "next" : "done"}
              placeholder={t("Full name")} value={name}
              ref={(element) => { inputs.current[index] = element; }}
              onChange={(event) => {
                const next = [...names];
                next[index] = event.target.value;
                onNamesChange(next);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  focusNext(index);
                }
              }} />
          </label>
      ))}
      <p className="subtle" role="status">{t("Names entered: {count}", { count: slots.filter((name) => name.trim()).length })}</p>
    </fieldset>
  );
}

export function SessionStudentsFields({ block, drafts, onChange, disabled }) {
  const { t } = useLanguage();
  return block.map((shift, index) => {
    const draft = drafts[shift.class_id] || { count: "", names: [] };
    const update = (field, value) => onChange((current) => ({
      ...current, [shift.class_id]: { ...(current[shift.class_id] || draft), [field]: value },
    }));
    return <AttendanceStudentsFields key={shift.class_id} count={draft.count} names={draft.names}
      title={`${t("Session {number}", { number: index + 1 })} · ${formatTimeValue(shift.start_time)} – ${formatTimeValue(shift.end_time)}`}
      onCountChange={(value) => update("count", value)} onNamesChange={(value) => update("names", value)} disabled={disabled} />;
  });
}

export default function AttendanceStudents({ names, sessions }) {
  const { t } = useLanguage();
  if (sessions?.length) return <div>{sessions.map((session, index) => <div key={session.class_id}>
    <strong>{t("Session {number}", { number: index + 1 })} · {formatTimeValue(session.start_time)} – {formatTimeValue(session.end_time)}</strong>
    <AttendanceStudents names={session.student_names} />
  </div>)}</div>;
  if (names == null) return <span className="subtle">{t("Students not recorded")}</span>;
  return (
    <details className="attendance-students">
      <summary>{t("{count} students — view names", { count: names.length })}</summary>
      <ol>{names.map((name, index) => <li key={index}>{name}</li>)}</ol>
    </details>
  );
}

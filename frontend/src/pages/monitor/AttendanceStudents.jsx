import { useRef } from "react";
import { useLanguage } from "../../lib/i18n.jsx";
import { MAX_STUDENT_COUNT, studentNameSlots } from "../../lib/attendanceStudents.js";

export function AttendanceStudentsFields({ count, names, onCountChange, onNamesChange, disabled }) {
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
      <legend>{t("Students taught")}</legend>
      <p className="subtle">{t("Enter students once for the whole visit, including consecutive classes.")}</p>
      <label className="field">
        <span>{t("Number of students")}</span>
        <input type="number" inputMode="numeric" min="1" max={MAX_STUDENT_COUNT} step="1" required value={count}
          onChange={(event) => onCountChange(event.target.value)} />
      </label>
      {slots.length > 0 ? <p className="subtle">{t("Enter each name in its own field. No line breaks needed.")}</p> : null}
      {slots.map((name, index) => (
        <div key={index} className="attendance-student-input-row">
          <label className="field">
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
          <button type="button" className="student-next-button" onClick={() => focusNext(index)}>
            {t(index < slots.length - 1 ? "Next student" : "Done entering names")}
          </button>
        </div>
      ))}
      <p className="subtle" role="status">{t("Names entered: {count}", { count: slots.filter((name) => name.trim()).length })}</p>
    </fieldset>
  );
}

export default function AttendanceStudents({ names }) {
  const { t } = useLanguage();
  if (names == null) return <span className="subtle">{t("Students not recorded")}</span>;
  return (
    <details className="attendance-students">
      <summary>{t("{count} students — view names", { count: names.length })}</summary>
      <p className="subtle">{t("Shared list for the whole visit")}</p>
      <ol>{names.map((name, index) => <li key={index}>{name}</li>)}</ol>
    </details>
  );
}

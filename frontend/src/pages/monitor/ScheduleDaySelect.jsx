import { useLanguage } from "../../lib/i18n.jsx";
import { formatAttendanceDayCode } from "./attendanceUtils.js";

export default function ScheduleDaySelect({ value, onChange }) {
  const { t, language } = useLanguage();
  return (
    <label className="field schedule-day-select">
      <span>{t("Teaching day")}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((day) => (
          <option key={day} value={day}>{formatAttendanceDayCode(day, language)}</option>
        ))}
      </select>
    </label>
  );
}

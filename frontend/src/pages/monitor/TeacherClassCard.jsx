import StatusPill from "./StatusPill.jsx";
import { formatTimeValue } from "./monitorUtils.js";
import { useLanguage } from "../../lib/i18n.jsx";
import { formatAttendanceDayCode } from "./attendanceUtils.js";

export default function TeacherClassCard({ item }) {
  const { t, language } = useLanguage();
  return (
    <article className="class-highlight-card">
      <div className="class-highlight-top">
        <p className="eyebrow">{t("Assigned class")}</p>
        <StatusPill value={item.status} />
      </div>
      <h3>{item.class_id}</h3>
      <p className="subtle">{`${formatAttendanceDayCode(item.day_of_week, language)} | ${formatTimeValue(item.start_time)} - ${formatTimeValue(item.end_time)}`}</p>
      <p className="subtle">{item.center_label}</p>
    </article>
  );
}

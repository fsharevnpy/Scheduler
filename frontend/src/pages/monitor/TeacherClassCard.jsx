import StatusPill from "./StatusPill.jsx";
import { formatTimeValue } from "./monitorUtils.js";

export default function TeacherClassCard({ item }) {
  return (
    <article className="class-highlight-card">
      <div className="class-highlight-top">
        <p className="eyebrow">Assigned Class</p>
        <StatusPill value={item.status} />
      </div>
      <h3>{item.class_id}</h3>
      <p className="subtle">{`${item.day_of_week} | ${formatTimeValue(item.start_time)} - ${formatTimeValue(item.end_time)}`}</p>
      <p className="subtle">{item.center_label}</p>
    </article>
  );
}

export default function StatusPill({ value }) {
  return <span className={`status-pill status-pill-${String(value).toLowerCase()}`}>{value}</span>;
}

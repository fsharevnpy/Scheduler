import { useLanguage } from "../../lib/i18n.jsx";

export default function StatusPill({ value }) {
  const { t } = useLanguage();
  const key = `status_${value}`;
  const label = t(key);
  return <span className={`status-pill status-pill-${String(value).toLowerCase()}`}>{!value || value === "-" ? "-" : label === key ? value : label}</span>;
}

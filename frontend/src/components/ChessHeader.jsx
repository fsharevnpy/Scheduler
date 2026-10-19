import logo from "../../chesslogo.png";
import { useLanguage } from "../lib/i18n.jsx";
import ChessIcon from "./ChessIcon.jsx";

export default function ChessHeader({ name, role, children }) {
  const { t } = useLanguage();
  return (
    <header className="dashboard-head chess-dashboard-head">
      <div className="chess-welcome">
        <div className="chess-brand">
          <img src={logo} alt="" width="52" height="52" />
          <div>
            <strong>CHESS FIGHTERS</strong>
            <span>{t("Every day, a better move.")}</span>
          </div>
        </div>
        <h1 className="dashboard-title">{t("welcomeBack", { name })}</h1>
        <p className="subtle">{t(role === "teacher" ? "dashboardTeacherCopy" : "dashboardAdminCopy")}</p>
      </div>
      <ChessIcon className="chess-hero-piece" />
      {children}
    </header>
  );
}

import { useEffect, useState } from "react";

import { useLanguage } from "../lib/i18n.jsx";

export default function AppUpdateBanner() {
  const [waitingWorker, setWaitingWorker] = useState(null);
  const { t } = useLanguage();

  useEffect(() => {
    function handleUpdateAvailable(event) {
      setWaitingWorker(event.detail?.worker || null);
    }

    window.addEventListener("app-update-available", handleUpdateAvailable);
    return () => window.removeEventListener("app-update-available", handleUpdateAvailable);
  }, []);

  if (!waitingWorker) {
    return null;
  }

  function refreshApp() {
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  }

  return (
    <div className="app-update-banner" role="status" aria-live="polite">
      <span>{t("newVersionAvailable")}</span>
      <button type="button" className="primary-button compact-button" onClick={refreshApp}>
        {t("refresh")}
      </button>
    </div>
  );
}

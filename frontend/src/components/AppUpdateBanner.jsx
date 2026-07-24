import { useEffect, useState } from "react";

export default function AppUpdateBanner() {
  const [waitingWorker, setWaitingWorker] = useState(null);

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
      <span>New version available.</span>
      <button type="button" className="primary-button compact-button" onClick={refreshApp}>
        Refresh
      </button>
    </div>
  );
}

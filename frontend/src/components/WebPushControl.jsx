import { useEffect, useState } from "react";

import {
  ensurePushSubscription,
  getPushSubscription,
  isPushSupported,
  subscribeToPush,
} from "../lib/pushNotifications.js";
import { useLanguage } from "../lib/i18n.jsx";

export default function WebPushControl({ auth }) {
  const [status, setStatus] = useState("checking");
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    let cancelled = false;

    async function checkStatus() {
      if (!auth.token || !isPushSupported()) {
        setStatus("unsupported");
        return;
      }

      const subscription =
        Notification.permission === "granted"
          ? await ensurePushSubscription(auth.apiBase, auth.token)
          : await getPushSubscription();
      if (!cancelled) {
        setStatus(subscription ? "enabled" : "disabled");
        setShowPermissionPrompt(!subscription && Notification.permission === "default");
      }
    }

    checkStatus().catch(() => {
      if (!cancelled) {
        setStatus("disabled");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [auth.apiBase, auth.token]);

  async function handleEnable() {
    setIsBusy(true);
    setMessage("");
    try {
      await subscribeToPush(auth.apiBase, auth.token);
      setStatus("enabled");
      setShowPermissionPrompt(false);
      setMessage(t("pushEnabled"));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsBusy(false);
    }
  }

  if (status === "unsupported") {
    return null;
  }

  return (
    <>
      {status !== "enabled" ? (
        <div className="web-push-control" aria-live="polite">
          <button type="button" className="secondary-button compact-button" onClick={handleEnable} disabled={isBusy}>
            {t("pushOn")}
          </button>
          {message ? <span>{message}</span> : null}
        </div>
      ) : null}

      {showPermissionPrompt ? (
        <div className="notification-permission-panel" role="dialog" aria-label={t("enableNotifications")}>
          <div>
            <strong>{t("enableNotifications")}</strong>
            <p>{t("enableNotificationsCopy")}</p>
          </div>
          <div className="notification-permission-actions">
            <button type="button" className="primary-button compact-button" onClick={handleEnable} disabled={isBusy}>
              {t("enable")}
            </button>
            <button type="button" className="inline-text-action" onClick={() => setShowPermissionPrompt(false)}>
              {t("later")}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

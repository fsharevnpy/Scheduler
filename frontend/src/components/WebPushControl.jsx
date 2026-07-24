import { useEffect, useState } from "react";

import {
  getPushSubscription,
  isPushSupported,
  sendTestPush,
  subscribeToPush,
  unsubscribeFromPush,
} from "../lib/pushNotifications.js";

export default function WebPushControl({ auth }) {
  const [status, setStatus] = useState("checking");
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function checkStatus() {
      if (!isPushSupported()) {
        setStatus("unsupported");
        return;
      }

      const subscription = await getPushSubscription();
      if (!cancelled) {
        setStatus(subscription ? "enabled" : "disabled");
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
  }, []);

  async function handleEnable() {
    setIsBusy(true);
    setMessage("");
    try {
      await subscribeToPush(auth.apiBase, auth.token);
      setStatus("enabled");
      setMessage("Enabled");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDisable() {
    setIsBusy(true);
    setMessage("");
    try {
      await unsubscribeFromPush(auth.apiBase, auth.token);
      setStatus("disabled");
      setMessage("Disabled");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleTest() {
    setIsBusy(true);
    setMessage("");
    try {
      await sendTestPush(auth.apiBase, auth.token);
      setMessage("Sent");
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
    <div className="web-push-control" aria-live="polite">
      {status === "enabled" ? (
        <>
          <button type="button" className="secondary-button compact-button" onClick={handleTest} disabled={isBusy}>
            Test push
          </button>
          <button type="button" className="inline-text-action" onClick={handleDisable} disabled={isBusy}>
            Off
          </button>
        </>
      ) : (
        <button type="button" className="secondary-button compact-button" onClick={handleEnable} disabled={isBusy}>
          Push on
        </button>
      )}
      {message ? <span>{message}</span> : null}
    </div>
  );
}

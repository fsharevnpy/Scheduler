import { useEffect, useRef, useState } from "react";

import { useLanguage } from "../lib/i18n.jsx";

export default function NotificationBell({ notifications = [], onMarkAllRead, onMarkRead }) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef(null);
  const unreadCount = notifications.filter((item) => item.unread).length;
  const { t } = useLanguage();

  useEffect(() => {
    function handlePointerDown(event) {
      if (!panelRef.current || panelRef.current.contains(event.target)) {
        return;
      }

      setIsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  return (
    <div className="notification-shell" ref={panelRef}>
      <button
        type="button"
        className="notification-button"
        aria-label={t("notificationLabel")}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span aria-hidden="true">Bell</span>
        {unreadCount > 0 ? <span className="notification-badge">{unreadCount}</span> : null}
      </button>

      {isOpen ? (
        <div className="notification-panel" role="dialog" aria-label={t("notificationLabel")}>
          <div className="notification-panel-head">
            <strong>{t("notifications")}</strong>
            <div className="notification-panel-actions">
              <span>{t("newNotifications", { count: unreadCount })}</span>
              {unreadCount > 0 && onMarkAllRead ? (
                <button type="button" className="inline-text-action" onClick={onMarkAllRead}>
                  {t("markAll")}
                </button>
              ) : null}
            </div>
          </div>

          {notifications.length === 0 ? (
            <p className="notification-empty">{t("noNotifications")}</p>
          ) : (
            <div className="notification-list">
              {notifications.map((item) => (
                <article className={`notification-item ${item.unread ? "unread" : ""}`.trim()} key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.message}</p>
                    {item.evidenceUrl ? (
                      <a className="inline-link" href={item.evidenceUrl} target="_blank" rel="noreferrer">
                        View evidence
                      </a>
                    ) : null}
                  </div>
                  <div className="notification-item-foot">
                    <span>{item.createdAt}</span>
                    {item.unread && onMarkRead ? (
                      <button type="button" className="inline-text-action" onClick={() => onMarkRead(item.id)}>
                        {t("markRead")}
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";

export default function NotificationBell({ notifications = [], onMarkAllRead, onMarkRead }) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef(null);
  const unreadCount = notifications.filter((item) => item.unread).length;

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
        aria-label="Notifications"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span aria-hidden="true">Bell</span>
        {unreadCount > 0 ? <span className="notification-badge">{unreadCount}</span> : null}
      </button>

      {isOpen ? (
        <div className="notification-panel" role="dialog" aria-label="Notifications">
          <div className="notification-panel-head">
            <strong>Notifications</strong>
            <div className="notification-panel-actions">
              <span>{unreadCount} new</span>
              {unreadCount > 0 && onMarkAllRead ? (
                <button type="button" className="inline-text-action" onClick={onMarkAllRead}>
                  Mark all
                </button>
              ) : null}
            </div>
          </div>

          {notifications.length === 0 ? (
            <p className="notification-empty">No notifications yet.</p>
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
                        Mark read
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

import { createPortal } from "react-dom";
import { useLanguage } from "../../lib/i18n.jsx";

export default function FloatingPanel({ eyebrow, title, titleId, onClose, children, className = "", closeDisabled = false }) {
  const { t } = useLanguage();
  return createPortal(
    <div className="floating-panel-backdrop" role="presentation" onClick={closeDisabled ? undefined : onClose}>
      <section
        className={`floating-panel ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="floating-panel-head">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            type="button"
            className="table-action-button table-action-button-muted"
            onClick={onClose}
            disabled={closeDisabled}
          >
            {t("close")}
          </button>
        </div>

        {children}
      </section>
    </div>,
    document.body,
  );
}

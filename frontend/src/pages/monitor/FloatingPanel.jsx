import { createPortal } from "react-dom";

export default function FloatingPanel({ eyebrow, title, titleId, onClose, children }) {
  return createPortal(
    <div className="floating-panel-backdrop" role="presentation" onClick={onClose}>
      <section
        className="floating-panel"
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
          >
            Close
          </button>
        </div>

        {children}
      </section>
    </div>,
    document.body,
  );
}

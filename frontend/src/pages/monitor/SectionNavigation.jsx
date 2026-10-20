import ChessIcon from "../../components/ChessIcon.jsx";
import { useLanguage } from "../../lib/i18n.jsx";

export default function SectionNavigation({ sections, activeSection, onChange, prefix = "monitor", label = "Dashboard sections" }) {
  const { t } = useLanguage();

  function handleKeyDown(event) {
    const tabs = Array.from(event.currentTarget.querySelectorAll('[role="tab"]'));
    const index = tabs.indexOf(event.target);
    if (index < 0) return;
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    tabs[next].focus({ preventScroll: true });
    tabs[next].click();
    const strip = event.currentTarget.getBoundingClientRect();
    const tab = tabs[next].getBoundingClientRect();
    if (tab.left < strip.left) event.currentTarget.scrollLeft -= strip.left - tab.left;
    else if (tab.right > strip.right) event.currentTarget.scrollLeft += tab.right - strip.right;
  }

  return (
    <div className="monitor-navigation" role="tablist" aria-label={t(label)} onKeyDown={handleKeyDown}>
      {sections.map(({ id, label: sectionLabel, piece, count = 0 }) => (
        <button key={id} id={`${prefix}-tab-${id}`} type="button" role="tab"
          aria-selected={activeSection === id} aria-controls={`${prefix}-${id}`}
          tabIndex={activeSection === id ? 0 : -1} onClick={() => onChange(id)}>
          <ChessIcon piece={piece} /><span className="navigation-label">{t(sectionLabel)}</span>
          {count > 0 ? <span className="navigation-count" aria-label={t("{count} pending requests", { count })}>{count}</span> : null}
        </button>
      ))}
    </div>
  );
}

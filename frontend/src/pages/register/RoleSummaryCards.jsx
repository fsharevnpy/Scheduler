export default function RoleSummaryCards({ currentRole }) {
  return (
    <section className="monitor-grid monitor-grid-summary">
      <article className="info-card">
        <p className="eyebrow">Current Role</p>
        <h2>{currentRole}</h2>
        <p className="subtle">You can only create roles allowed for this session.</p>
      </article>

      <article className="info-card">
        <p className="eyebrow">Manager</p>
        <h2>manager, teacher</h2>
        <p className="subtle">Managers can create new manager and teacher accounts only.</p>
      </article>

      <article className="info-card">
        <p className="eyebrow">Developer</p>
        <h2>developer, manager, teacher</h2>
        <p className="subtle">Developers can create the same roles as managers plus new developer accounts.</p>
      </article>
    </section>
  );
}

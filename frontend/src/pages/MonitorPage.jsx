import { Link } from "react-router-dom";

export default function MonitorPage({ auth }) {
  const user = auth.user;

  return (
    <main className="dashboard-shell">
      <section className="dashboard-card">
        <div className="dashboard-head">
          <div>
            <p className="eyebrow">Monitor</p>
            <h1 className="dashboard-title">Welcome back, {user.username}.</h1>
            <p className="subtle">
              This is the protected app shell. The next step is to replace these placeholders with live dashboard modules.
            </p>
          </div>
          <button type="button" className="secondary-button" onClick={auth.logout}>
            Log out
          </button>
        </div>

        <div className="monitor-grid">
          <article className="info-card">
            <p className="eyebrow">Session</p>
            <h2>{user.role}</h2>
            <p className="subtle">Teacher ID: {user.teacher_id || "-"}</p>
          </article>

          <article className="info-card">
            <p className="eyebrow">Next Screen</p>
            <h2>Role-based dashboard</h2>
            <p className="subtle">Classes, leave requests, and replacement actions can now be added on top of this route.</p>
          </article>

          {(user.role === "developer" || user.role === "manager") && (
            <article className="info-card">
              <p className="eyebrow">Registration</p>
              <h2>User onboarding</h2>
              <p className="subtle">You have access to the internal register screen.</p>
              <Link className="inline-link" to="/register">Open register screen</Link>
            </article>
          )}
        </div>
      </section>
    </main>
  );
}

import { Link } from "react-router-dom";

export default function RegisterPage({ auth }) {
  return (
    <main className="dashboard-shell">
      <section className="dashboard-card">
        <div className="dashboard-head">
          <div>
            <p className="eyebrow">Register</p>
            <h1 className="dashboard-title">Internal user creation</h1>
            <p className="subtle">
              This route is protected for developer and manager only. The actual registration form can be implemented next against `POST /users`.
            </p>
          </div>
          <button type="button" className="secondary-button" onClick={auth.logout}>
            Log out
          </button>
        </div>

        <div className="monitor-grid">
          <article className="info-card">
            <p className="eyebrow">Role</p>
            <h2>{auth.user.role}</h2>
            <p className="subtle">
              Developer can create developer, manager, and teacher. Manager can create manager and teacher.
            </p>
          </article>

          <article className="info-card">
            <p className="eyebrow">Next Step</p>
            <h2>Build register form</h2>
            <p className="subtle">Fields: username, password, role, active, and teacher ID when role is teacher.</p>
            <Link className="inline-link" to="/monitor">Back to monitor</Link>
          </article>
        </div>
      </section>
    </main>
  );
}

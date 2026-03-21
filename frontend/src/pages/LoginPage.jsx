import { useState } from "react";
import logo from "../../chesslogo.svg";

const DEFAULT_API_BASE = `${window.location.protocol}//${window.location.hostname}:8000`;

const SEEDED_ACCOUNTS = [
  { username: "developer", password: "dev123" },
  { username: "manager", password: "manager123" },
  { username: "gv0", password: "teacher123" },
  { username: "gv1", password: "teacher123" },
  { username: "gv2", password: "teacher123" },
];

export default function LoginPage({ auth }) {
  const [apiBase, setApiBase] = useState(auth.apiBase || DEFAULT_API_BASE);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState({ kind: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus({ kind: "", message: "Signing in..." });

    try {
      const normalizedBase = apiBase.trim().replace(/\/+$/, "");
      await auth.login(normalizedBase, {
        username: username.trim(),
        password,
      });
    } catch (error) {
      setStatus({ kind: "error", message: error.message });
    } finally {
      setIsSubmitting(false);
    }
  }

  function loadSeed(account) {
    setUsername(account.username);
    setPassword(account.password);
    setStatus({ kind: "", message: `Loaded seeded account ${account.username}.` });
  }

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <div className="brand-lockup">
          <img src={logo} alt="Scheduler logo" className="brand-mark" />
          <div>
            <p className="eyebrow">Scheduler Platform</p>
            <h1>Sign in to manage classes, leave requests, and replacements.</h1>
          </div>
        </div>
        <div className="hero-copy">
          <p>
            This frontend now runs on React + Vite. The login flow matches the FastAPI backend and stores the
            access token for protected routes.
          </p>
          <ul className="role-list">
            <li><span>Developer</span><code>full platform access</code></li>
            <li><span>Manager</span><code>operations and registration</code></li>
            <li><span>Teacher</span><code>personal schedule and leave requests</code></li>
          </ul>
        </div>
      </section>

      <section className="auth-panel">
        <div className="panel-card">
          <div className="panel-head">
            <p className="eyebrow">Login</p>
            <h2>Access the dashboard</h2>
            <p className="subtle">Default backend URL is detected automatically. Override it only if your API runs elsewhere.</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Backend URL</span>
              <input value={apiBase} onChange={(event) => setApiBase(event.target.value)} type="url" placeholder="http://localhost:8000" required />
            </label>
            <label className="field">
              <span>Username</span>
              <input value={username} onChange={(event) => setUsername(event.target.value)} type="text" autoComplete="username" required />
            </label>
            <label className="field">
              <span>Password</span>
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required />
            </label>
            <button className="primary-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className={`status ${status.kind}`.trim()} aria-live="polite">
            {status.message}
          </div>

          <section className="seed-panel">
            <p className="eyebrow">Seeded Accounts</p>
            <div className="seed-grid">
              {SEEDED_ACCOUNTS.map((account) => (
                <button
                  key={account.username}
                  type="button"
                  className="seed-button"
                  onClick={() => loadSeed(account)}
                >
                  {account.username}
                </button>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

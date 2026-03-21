import { useState } from "react";
import logo from "../../chesslogo.svg";

const SEEDED_ACCOUNTS = [
  { username: "developer", password: "dev123" },
  { username: "manager", password: "manager123" },
  { username: "gv0", password: "teacher123" },
  { username: "gv1", password: "teacher123" },
  { username: "gv2", password: "teacher123" },
];

export default function LoginPage({ auth }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState({ kind: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus({ kind: "", message: "Signing in..." });

    try {
      await auth.login(auth.apiBase, {
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
    <main className="login-shell">
      <section className="login-card">
        <div className="login-brand">
          <img src={logo} alt="Chess Fighter logo" className="brand-mark large" />
          <p className="eyebrow">Chess Fighter</p>
          <h1 className="login-title">Sign in</h1>
          <p className="login-copy">Access the internal scheduling workspace for classes, leave requests, and replacement operations.</p>
        </div>

        <form className="auth-form compact" onSubmit={handleSubmit}>
          <label className="field">
            <span>Username</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} type="text" autoComplete="username" required />
          </label>
          <label className="field">
            <div className="field-head">
              <span>Password</span>
              <button
                type="button"
                className="text-button"
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
            />
          </label>
          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Login"}
          </button>
        </form>

        <div className={`status ${status.kind}`.trim()} aria-live="polite">
          {status.message}
        </div>

        <section className="seed-panel compact">
          <p className="eyebrow">Quick Fill</p>
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
      </section>
    </main>
  );
}

import { useState } from "react";
import logo from "../../chesslogo.svg";
import { requestJson } from "../lib/http.js";

export default function LoginPage({ auth }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [forgotUsername, setForgotUsername] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [status, setStatus] = useState({ kind: "", message: "" });
  const [forgotStatus, setForgotStatus] = useState({ kind: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequestingReset, setIsRequestingReset] = useState(false);

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

  async function handleForgotPassword(event) {
    event.preventDefault();
    setIsRequestingReset(true);
    setForgotStatus({ kind: "", message: "Submitting reset request..." });

    try {
      await requestJson(`${auth.apiBase}/password-reset-requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: forgotUsername.trim(),
          request_note: "Requested from login screen",
        }),
      });
      setForgotStatus({
        kind: "success",
        message: "Reset request sent. Please contact a manager or developer.",
      });
      setForgotUsername("");
    } catch (error) {
      setForgotStatus({ kind: "error", message: error.message });
    } finally {
      setIsRequestingReset(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-brand">
          <img src={logo} alt="Chess Fighter logo" className="brand-mark large" />
          <h1 className="login-title">Sign in</h1>
          <p className="login-copy">Welcome to the Chess Fighter homepage. Sign in to access the internal scheduling workspace.</p>
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
                className="inline-text-action"
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

        <div className="login-actions">
          <button
            type="button"
            className="inline-text-action support-trigger"
            onClick={() => {
              setShowForgotPassword((value) => !value);
              setForgotStatus({ kind: "", message: "" });
              setForgotUsername(username.trim());
            }}
          >
            {showForgotPassword ? "Close forgot password" : "Forgot password?"}
          </button>
        </div>

        {showForgotPassword ? (
          <section className="support-panel compact">
            <p className="support-copy">
              Password reset is handled internally by a manager or developer.
            </p>
            <form className="auth-form support-form" onSubmit={handleForgotPassword}>
              <label className="field">
                <span>Username</span>
                <input
                  value={forgotUsername}
                  onChange={(event) => setForgotUsername(event.target.value)}
                  type="text"
                  autoComplete="username"
                  required
                />
              </label>
              <button className="secondary-button" type="submit" disabled={isRequestingReset}>
                {isRequestingReset ? "Sending..." : "Send reset request"}
              </button>
              <div className={`status ${forgotStatus.kind}`.trim()} aria-live="polite">
                {forgotStatus.message}
              </div>
            </form>
          </section>
        ) : null}
      </section>
    </main>
  );
}

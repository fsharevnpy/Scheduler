import { useState } from "react";

import logo from "../../../chesslogo.svg";
import PasswordField from "../../components/PasswordField.jsx";
import { requestJson } from "../../lib/http.js";
import ForgotPasswordPanel from "./ForgotPasswordPanel.jsx";

export default function LoginPage({ auth }) {
  const [userCode, setUserCode] = useState("");
  const [password, setPassword] = useState("");
  const [forgotUserCode, setForgotUserCode] = useState("");
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
        user_code: userCode.trim(),
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
          user_code: forgotUserCode.trim(),
          request_note: "Requested from login screen",
        }),
      });
      setForgotStatus({
        kind: "success",
        message: "Reset request sent. Please contact a manager or developer.",
      });
      setForgotUserCode("");
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
            <span>User Code</span>
            <input value={userCode} onChange={(event) => setUserCode(event.target.value)} type="text" autoComplete="off" required />
          </label>
          <PasswordField
            id="login-password"
            label="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
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
              setForgotUserCode(userCode.trim());
            }}
          >
            {showForgotPassword ? "Close forgot password" : "Forgot password?"}
          </button>
        </div>

        {showForgotPassword ? (
          <ForgotPasswordPanel
            forgotUserCode={forgotUserCode}
            forgotStatus={forgotStatus}
            isRequestingReset={isRequestingReset}
            onForgotUserCodeChange={(event) => setForgotUserCode(event.target.value)}
            onSubmit={handleForgotPassword}
          />
        ) : null}
      </section>
    </main>
  );
}

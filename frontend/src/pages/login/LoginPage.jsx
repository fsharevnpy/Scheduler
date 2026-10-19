import { useState } from "react";

import logo from "../../../chesslogo.png";
import LanguageToggle from "../../components/LanguageToggle.jsx";
import PasswordField from "../../components/PasswordField.jsx";
import { requestJson } from "../../lib/http.js";
import { useLanguage } from "../../lib/i18n.jsx";
import ForgotPasswordPanel from "./ForgotPasswordPanel.jsx";

export default function LoginPage({ auth }) {
  const { t } = useLanguage();
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
    setStatus({ kind: "", message: t("signingIn") });

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
        message: t("resetRequestSent"),
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
        <div className="login-language-row">
          <LanguageToggle />
        </div>
        <div className="login-brand">
          <img src={logo} alt="Chess Fighters" className="brand-mark large" />
          <p className="chess-login-motto">{t("Every day, a better move.")}</p>
          <h1 className="login-title">{t("signIn")}</h1>
          <p className="login-copy">{t("loginCopy")}</p>
        </div>

        <form className="auth-form compact" onSubmit={handleSubmit}>
          <label className="field">
            <span>{t("userCode")}</span>
            <input value={userCode} onChange={(event) => setUserCode(event.target.value)} type="text" autoComplete="off" required />
          </label>
          <PasswordField
            id="login-password"
            label={t("password")}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? t("signingIn") : t("login")}
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
            {showForgotPassword ? t("closeForgotPassword") : t("forgotPassword")}
          </button>
        </div>

        {showForgotPassword ? (
          <ForgotPasswordPanel
            forgotUserCode={forgotUserCode}
            forgotStatus={forgotStatus}
            isRequestingReset={isRequestingReset}
            t={t}
            onForgotUserCodeChange={(event) => setForgotUserCode(event.target.value)}
            onSubmit={handleForgotPassword}
          />
        ) : null}
      </section>
    </main>
  );
}

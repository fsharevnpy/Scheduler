export default function ForgotPasswordPanel({
  forgotUserCode,
  forgotStatus,
  isRequestingReset,
  t,
  onForgotUserCodeChange,
  onSubmit,
}) {
  return (
    <section className="support-panel compact">
      <p className="support-copy">{t("passwordResetCopy")}</p>
      <form className="auth-form support-form" onSubmit={onSubmit}>
        <label className="field">
          <span>{t("userCode")}</span>
          <input
            value={forgotUserCode}
            onChange={onForgotUserCodeChange}
            type="text"
            autoComplete="off"
            required
          />
        </label>
        <button className="secondary-button" type="submit" disabled={isRequestingReset}>
          {isRequestingReset ? t("sending") : t("sendResetRequest")}
        </button>
        <div className={`status ${forgotStatus.kind}`.trim()} aria-live="polite">
          {forgotStatus.message}
        </div>
      </form>
    </section>
  );
}

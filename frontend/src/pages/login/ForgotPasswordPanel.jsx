export default function ForgotPasswordPanel({
  forgotUserCode,
  forgotStatus,
  isRequestingReset,
  onForgotUserCodeChange,
  onSubmit,
}) {
  return (
    <section className="support-panel compact">
      <p className="support-copy">
        Password reset is handled internally by a manager or developer.
      </p>
      <form className="auth-form support-form" onSubmit={onSubmit}>
        <label className="field">
          <span>User Code</span>
          <input
            value={forgotUserCode}
            onChange={onForgotUserCodeChange}
            type="text"
            autoComplete="off"
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
  );
}

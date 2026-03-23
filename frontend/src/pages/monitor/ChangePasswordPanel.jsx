import PasswordField from "../../components/PasswordField.jsx";

const PASSWORD_HELP = "Minimum 8 characters, with uppercase, lowercase, number, and special character.";

export default function ChangePasswordPanel({
  form,
  pendingAction,
  status,
  onFieldChange,
  onSubmit,
}) {
  return (
    <section className="dashboard-section">
      <div className="section-head">
        <div>
          <p className="eyebrow">Account</p>
          <h2>Change Password</h2>
        </div>
      </div>

      <form className="auth-form register-form" onSubmit={onSubmit}>
        <PasswordField
          id="current-password"
          label="Current Password"
          value={form.current_password}
          onChange={(event) => onFieldChange("current_password", event.target.value)}
          autoComplete="current-password"
          required
        />

        <PasswordField
          id="new-password"
          label="New Password"
          value={form.new_password}
          onChange={(event) => onFieldChange("new_password", event.target.value)}
          autoComplete="new-password"
          required
          helpText={PASSWORD_HELP}
        />

        <PasswordField
          id="confirm-new-password"
          label="Confirm New Password"
          value={form.confirm_new_password}
          onChange={(event) => onFieldChange("confirm_new_password", event.target.value)}
          autoComplete="new-password"
          required
        />

        <button className="primary-button form-button-fit" type="submit" disabled={pendingAction === "change-password"}>
          {pendingAction === "change-password" ? "Updating..." : "Change password"}
        </button>
      </form>

      <div className={`status ${status.kind}`.trim()} aria-live="polite">
        {status.message}
      </div>
    </section>
  );
}

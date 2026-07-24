import PasswordField from "../../components/PasswordField.jsx";
import { useLanguage } from "../../lib/i18n.jsx";

export default function PasswordSettingsPanel({
  form,
  pendingAction,
  status,
  onFieldChange,
  onSubmit,
}) {
  const { t } = useLanguage();

  return (
    <section className="dashboard-section">
      <div className="section-head">
        <div>
          <p className="eyebrow">{t("security")}</p>
          <h2>{t("password")}</h2>
        </div>
      </div>

      <form className="auth-form register-form" onSubmit={onSubmit}>
        <PasswordField
          id="current-password"
          label={t("currentPassword")}
          value={form.current_password}
          onChange={(event) => onFieldChange("current_password", event.target.value)}
          autoComplete="current-password"
          required
        />

        <PasswordField
          id="new-password"
          label={t("newPassword")}
          value={form.new_password}
          onChange={(event) => onFieldChange("new_password", event.target.value)}
          autoComplete="new-password"
          required
          helpText={t("passwordHelp")}
        />

        <PasswordField
          id="confirm-new-password"
          label={t("confirmNewPassword")}
          value={form.confirm_new_password}
          onChange={(event) => onFieldChange("confirm_new_password", event.target.value)}
          autoComplete="new-password"
          required
        />

        <button className="primary-button form-button-fit" type="submit" disabled={pendingAction === "change-password"}>
          {pendingAction === "change-password" ? t("updating") : t("updatePassword")}
        </button>
      </form>

      <div className={`status ${status.kind}`.trim()} aria-live="polite">
        {status.message}
      </div>
    </section>
  );
}

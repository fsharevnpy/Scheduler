import { useLanguage } from "../../lib/i18n.jsx";
import { getRoleTitle } from "../../lib/roles.js";
import { formatAttendanceDayCode } from "../monitor/attendanceUtils.js";
import { formatTimeValue } from "../monitor/monitorUtils.js";

export default function UserCreateForm({
  classes,
  form,
  isSubmitting,
  roleOptions,
  status,
  onAddPreferenceRow,
  onFieldChange,
  onPreferenceChange,
  onRemovePreferenceRow,
  onSubmit,
}) {
  const { t, language } = useLanguage();
  return (
    <section className="dashboard-section">
      <div className="section-head">
        <div>
          <p className="eyebrow">{t("Create user")}</p>
          <h2>{t("New account form")}</h2>
        </div>
      </div>

      <form lang={language} className="auth-form register-form" onSubmit={onSubmit}>
        {form.role === "teacher" ? (
          <>
            <label className="field">
              <span>{t("Name")}</span>
              <input
                value={form.name}
                onChange={(event) => onFieldChange("name", event.target.value)}
                type="text"
                required
              />
            </label>

            <label className="field">
              <span>{t("Phone")}</span>
              <input
                value={form.contact}
                onChange={(event) => onFieldChange("contact", event.target.value)}
                type="text"
                required
              />
            </label>

            <label className="field">
              <span>{t("Personal email")}</span>
              <input
                value={form.email}
                onChange={(event) => onFieldChange("email", event.target.value)}
                type="email"
                required
              />
            </label>

            <label className="field">
              <span>{t("ELO")}</span>
              <input
                value={form.elo}
                onChange={(event) => onFieldChange("elo", event.target.value)}
                type="number"
                min="0"
                required
              />
            </label>

            <label className="field">
              <span>{t("Max Slots / Day")}</span>
              <input
                value={form.max_slots_per_day}
                onChange={(event) => onFieldChange("max_slots_per_day", event.target.value)}
                type="number"
                min="1"
                required
              />
            </label>

            <div className="field">
              <div className="field-head">
                <span>{t("Teaching preferences")}</span>
                <button type="button" className="inline-text-action" onClick={onAddPreferenceRow}>
                  {t("Add preference")}
                </button>
              </div>
              <small className="field-help">{t("Optional. Select from existing classes only.")}</small>
            </div>

            <div className="preference-list">
              {form.preferences.map((preference, index) => (
                <div className="preference-card preference-card-class" key={`${index}-${preference.class_id}`}>
                  <label className="field">
                    <span>{t("Class")}</span>
                    <select
                      value={preference.class_id}
                      onChange={(event) => onPreferenceChange(index, "class_id", event.target.value)}
                    >
                      <option value="">{t("Select class")}</option>
                      {classes.map((item) => (
                        <option key={item.class_id} value={item.class_id}>
                          {item.class_id} - {formatAttendanceDayCode(item.day_of_week, language)} - {item.center_id} - {formatTimeValue(item.start_time)} – {formatTimeValue(item.end_time)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button type="button" className="secondary-button preference-remove" onClick={() => onRemovePreferenceRow(index)}>
                    {t("Remove")}
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <label className="field">
            <span>{t("Display Name")}</span>
            <input
              value={form.display_name}
              onChange={(event) => onFieldChange("display_name", event.target.value)}
              type="text"
              required
            />
          </label>
        )}

        <label className="field">
          <span>{t("Role")}</span>
          <select value={form.role} onChange={(event) => onFieldChange("role", event.target.value)}>
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {getRoleTitle(role, t)}
              </option>
            ))}
          </select>
        </label>

        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {t(isSubmitting ? "Creating..." : "Create user")}
        </button>
      </form>

      <div className={`status ${status.kind}`.trim()} aria-live="polite">
        {t(status.message, status.values)}
      </div>
    </section>
  );
}

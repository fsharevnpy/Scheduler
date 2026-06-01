export default function UserCreateForm({
  centers,
  centersError,
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
  return (
    <section className="dashboard-section">
      <div className="section-head">
        <div>
          <p className="eyebrow">Create User</p>
          <h2>New account form</h2>
        </div>
      </div>

      <form className="auth-form register-form" onSubmit={onSubmit}>
        {form.role === "teacher" ? (
          <>
            <label className="field">
              <span>Name</span>
              <input
                value={form.name}
                onChange={(event) => onFieldChange("name", event.target.value)}
                type="text"
                required
              />
            </label>

            <label className="field">
              <span>Contact</span>
              <input
                value={form.contact}
                onChange={(event) => onFieldChange("contact", event.target.value)}
                type="text"
                required
              />
            </label>

            <label className="field">
              <span>Personal Email</span>
              <input
                value={form.email}
                onChange={(event) => onFieldChange("email", event.target.value)}
                type="email"
                required
              />
            </label>

            <label className="field">
              <span>ELO</span>
              <input
                value={form.elo}
                onChange={(event) => onFieldChange("elo", event.target.value)}
                type="number"
                min="0"
                required
              />
            </label>

            <label className="field">
              <span>Max Slots Per Day</span>
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
                <span>Preferences</span>
                <button type="button" className="inline-text-action" onClick={onAddPreferenceRow}>
                  Add preference
                </button>
              </div>
              <small className="field-help">Optional. Select from existing classes only.</small>
              {centersError ? <small className="field-help">{centersError}</small> : null}
            </div>

            <div className="preference-list">
              {form.preferences.map((preference, index) => (
                <div className="preference-card preference-card-class" key={`${index}-${preference.class_id}`}>
                  <label className="field">
                    <span>Class</span>
                    <select
                      value={preference.class_id}
                      onChange={(event) => onPreferenceChange(index, "class_id", event.target.value)}
                    >
                      <option value="">Select class</option>
                      {classes.map((item) => (
                        <option key={item.class_id} value={item.class_id}>
                          {item.class_id} - {item.day_of_week} - {item.center_id} - {item.start_time} to {item.end_time}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button type="button" className="secondary-button preference-remove" onClick={() => onRemovePreferenceRow(index)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <label className="field">
            <span>Display Name</span>
            <input
              value={form.display_name}
              onChange={(event) => onFieldChange("display_name", event.target.value)}
              type="text"
              required
            />
          </label>
        )}

        <label className="field">
          <span>Role</span>
          <select value={form.role} onChange={(event) => onFieldChange("role", event.target.value)}>
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>

        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating..." : "Create user"}
        </button>
      </form>

      <div className={`status ${status.kind}`.trim()} aria-live="polite">
        {status.message}
      </div>
    </section>
  );
}

export default function UserCreateForm({
  centers,
  centersError,
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
              <span>Score</span>
              <input
                value={form.score}
                onChange={(event) => onFieldChange("score", event.target.value)}
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
              <small className="field-help">Optional. Use 24-hour `HH:MM` format such as `07:30` or `18:00`.</small>
              {centersError ? <small className="field-help">{centersError}</small> : null}
            </div>

            <div className="preference-list">
              {form.preferences.map((preference, index) => (
                <div className="preference-card" key={`${index}-${preference.day_of_week}`}>
                  <label className="field">
                    <span>Center ID</span>
                    <select
                      value={preference.preferred_center_id}
                      onChange={(event) => onPreferenceChange(index, "preferred_center_id", event.target.value)}
                    >
                      <option value="">Select center</option>
                      {centers.map((center) => (
                        <option key={center.center_id} value={center.center_id}>
                          {center.center_id} - {center.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Day</span>
                    <select value={preference.day_of_week} onChange={(event) => onPreferenceChange(index, "day_of_week", event.target.value)}>
                      {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Start Time</span>
                    <input
                      value={preference.preferred_start_time}
                      onChange={(event) => onPreferenceChange(index, "preferred_start_time", event.target.value)}
                      type="text"
                      inputMode="numeric"
                      placeholder="HH:MM"
                      pattern="^([0-1]?\\d|2[0-3]):[0-5]\\d$"
                    />
                  </label>

                  <label className="field">
                    <span>End Time</span>
                    <input
                      value={preference.preferred_end_time}
                      onChange={(event) => onPreferenceChange(index, "preferred_end_time", event.target.value)}
                      type="text"
                      inputMode="numeric"
                      placeholder="HH:MM"
                      pattern="^([0-1]?\\d|2[0-3]):[0-5]\\d$"
                    />
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

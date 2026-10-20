import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

import AppNotificationBell from "../../components/AppNotificationBell.jsx";
import LanguageToggle from "../../components/LanguageToggle.jsx";
import UserAvatar from "../../components/UserAvatar.jsx";
import { useLanguage } from "../../lib/i18n.jsx";
import { requestJson } from "../../lib/http.js";
import { getRoleTitle } from "../../lib/roles.js";
import UserCreateForm from "./UserCreateForm.jsx";

const EMPTY_PREFERENCE = { class_id: "" };

export default function RegisterPage({ auth }) {
  const { t } = useLanguage();
  const roleOptions = useMemo(
    () => (auth.user.role === "developer" ? ["developer", "manager", "teacher"] : ["manager", "teacher"]),
    [auth.user.role],
  );
  const [form, setForm] = useState({
    display_name: "", role: roleOptions[0], name: "", contact: "", email: "",
    elo: 0, max_slots_per_day: 2, preferences: [{ ...EMPTY_PREFERENCE }],
  });
  const [status, setStatus] = useState({ kind: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [classes, setClasses] = useState([]);
  const [classesError, setClassesError] = useState("");
  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${auth.token}` }), [auth.token]);

  useEffect(() => {
    let cancelled = false;
    async function loadClasses() {
      if (!auth.token) return;
      try {
        const data = await requestJson(`${auth.apiBase}/classes`, { headers: authHeaders });
        if (!cancelled) {
          setClasses(data);
          setClassesError("");
        }
      } catch (error) {
        if (!cancelled) {
          setClasses([]);
          setClassesError(error.message);
        }
      }
    }
    loadClasses();
    return () => { cancelled = true; };
  }, [auth.apiBase, auth.token, authHeaders]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updatePreference(index, key, value) {
    setForm((current) => ({
      ...current,
      preferences: current.preferences.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }));
  }

  function addPreferenceRow() {
    setForm((current) => ({ ...current, preferences: [...current.preferences, { ...EMPTY_PREFERENCE }] }));
  }

  function removePreferenceRow(index) {
    setForm((current) => ({
      ...current,
      preferences: current.preferences.length === 1 ? [{ ...EMPTY_PREFERENCE }] : current.preferences.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus({ kind: "", message: "Creating user..." });
    try {
      const preferences = [];
      if (form.role === "teacher") {
        for (const preference of form.preferences) {
          const classId = preference.class_id.trim();
          if (!classId) continue;
          const selectedClass = classes.find((item) => item.class_id === classId);
          if (!selectedClass) throw new Error("Each preference row must select an existing class.");
          preferences.push({
            preferred_center_id: selectedClass.center_id, day_of_week: selectedClass.day_of_week,
            preferred_start_time: selectedClass.start_time, preferred_end_time: selectedClass.end_time,
          });
        }
      }
      const payload = form.role === "teacher" ? {
        role: form.role, name: form.name.trim(), contact: form.contact.trim(), email: form.email.trim(),
        elo: Number(form.elo), max_slots_per_day: Number(form.max_slots_per_day), preferences,
      } : { display_name: form.display_name.trim(), role: form.role };
      const created = await requestJson(`${auth.apiBase}/users`, {
        method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      setStatus({
        kind: "success",
        message: form.role === "teacher" ? "Created teacher account {name} ({code}, {teacherId})." : "Created account {name} ({code}).",
        values: { name: created.display_name, code: created.user_code, teacherId: created.teacher_id },
      });
      setForm({
        display_name: "", role: roleOptions[0], name: "", contact: "", email: "",
        elo: 0, max_slots_per_day: 2, preferences: [{ ...EMPTY_PREFERENCE }],
      });
    } catch (error) {
      setStatus({ kind: "error", message: error.message });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="dashboard-shell">
      <section className="dashboard-card dashboard-card-wide">
        <div className="dashboard-head">
          <div>
            <p className="eyebrow">{t("register")}</p>
            <h1 className="dashboard-title">{t("registerTitle")}</h1>
            <p className="subtle">{t("registerCopy")}</p>
          </div>
          <div className="dashboard-actions">
            <AppNotificationBell auth={auth} />
            <LanguageToggle />
            <div className="account-chip">
              <UserAvatar apiBase={auth.apiBase} imageUrl={auth.user?.profile_image_url}
                name={auth.user?.display_name} fallbackCode={auth.user?.user_code} size="medium" />
              <div className="account-chip-copy">
                <strong>{getRoleTitle(auth.user?.role, t)}</strong>
                <span>{auth.user?.user_code}</span>
              </div>
            </div>
            <div className="dashboard-action-stack">
              <button type="button" className="secondary-button" onClick={auth.logout}>{t("logout")}</button>
              <Link className="inline-link" to="/profile-settings">{t("profileSettings")}</Link>
              <Link className="inline-link" to="/monitor">{t("monitor")}</Link>
            </div>
          </div>
        </div>
        {classesError ? <div className="status error" role="alert">{t(classesError)}</div> : null}
        <UserCreateForm classes={classes} form={form} isSubmitting={isSubmitting} roleOptions={roleOptions}
          status={status} onAddPreferenceRow={addPreferenceRow} onFieldChange={updateField}
          onPreferenceChange={updatePreference} onRemovePreferenceRow={removePreferenceRow} onSubmit={handleSubmit} />
      </section>
    </main>
  );
}

import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

import { requestJson } from "../../lib/http.js";
import RoleSummaryCards from "./RoleSummaryCards.jsx";
import UserCreateForm from "./UserCreateForm.jsx";

const EMPTY_PREFERENCE = {
  preferred_center_id: "",
  day_of_week: "T2",
  preferred_start_time: "",
  preferred_end_time: "",
};

export default function RegisterPage({ auth }) {
  const roleOptions = useMemo(
    () => (auth.user.role === "developer" ? ["developer", "manager", "teacher"] : ["manager", "teacher"]),
    [auth.user.role],
  );

  const [form, setForm] = useState({
    display_name: "",
    password: "",
    role: roleOptions[0],
    name: "",
    contact: "",
    score: 0,
    max_slots_per_day: 2,
    preferences: [{ ...EMPTY_PREFERENCE }],
    active: true,
  });
  const [status, setStatus] = useState({ kind: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [centers, setCenters] = useState([]);
  const [centersError, setCentersError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCenters() {
      if (!auth.token) {
        return;
      }

      try {
        const data = await requestJson(`${auth.apiBase}/centers`, {
          headers: {
            Authorization: `Bearer ${auth.token}`,
          },
        });

        if (!cancelled) {
          setCenters(data);
          setCentersError("");
        }
      } catch (error) {
        if (!cancelled) {
          setCenters([]);
          setCentersError(error.message);
        }
      }
    }

    loadCenters();
    return () => {
      cancelled = true;
    };
  }, [auth.apiBase, auth.token]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updatePreference(index, key, value) {
    setForm((current) => ({
      ...current,
      preferences: current.preferences.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    }));
  }

  function addPreferenceRow() {
    setForm((current) => ({
      ...current,
      preferences: [...current.preferences, { ...EMPTY_PREFERENCE }],
    }));
  }

  function removePreferenceRow(index) {
    setForm((current) => ({
      ...current,
      preferences:
        current.preferences.length === 1
          ? [{ ...EMPTY_PREFERENCE }]
          : current.preferences.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus({ kind: "", message: "Creating user..." });

    try {
      if (form.role === "teacher") {
        const preferences = [];
        for (const preference of form.preferences) {
          const trimmedCenterId = preference.preferred_center_id.trim();
          const hasAnyValue =
            trimmedCenterId ||
            preference.preferred_start_time ||
            preference.preferred_end_time;

          if (!hasAnyValue) {
            continue;
          }

          if (!trimmedCenterId || !preference.preferred_start_time || !preference.preferred_end_time) {
            throw new Error("Each preference row must include center, start time, and end time.");
          }

          preferences.push({
            preferred_center_id: trimmedCenterId,
            day_of_week: preference.day_of_week,
            preferred_start_time: preference.preferred_start_time,
            preferred_end_time: preference.preferred_end_time,
          });
        }

        const payload = {
          role: form.role,
          name: form.name.trim(),
          contact: form.contact.trim(),
          score: Number(form.score),
          max_slots_per_day: Number(form.max_slots_per_day),
          active: form.active,
          preferences,
        };

        const createdUser = await requestJson(`${auth.apiBase}/users`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${auth.token}`,
          },
          body: JSON.stringify(payload),
        });

        setStatus({
          kind: "success",
          message: `Created teacher account ${createdUser.display_name} (${createdUser.user_code}, ${createdUser.teacher_id}). Temporary password: 123456aA@`,
        });
      } else {
        const payload = {
          display_name: form.display_name.trim(),
          password: form.password,
          role: form.role,
          active: form.active,
        };

        const createdUser = await requestJson(`${auth.apiBase}/users`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${auth.token}`,
          },
          body: JSON.stringify(payload),
        });

        setStatus({
          kind: "success",
          message: `Created ${createdUser.role} account ${createdUser.display_name} (${createdUser.user_code}). Use this code to sign in.`,
        });
      }
      setForm({
        display_name: "",
        password: "",
        role: roleOptions[0],
        name: "",
        contact: "",
        score: 0,
        max_slots_per_day: 2,
        preferences: [{ ...EMPTY_PREFERENCE }],
        active: true,
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
            <p className="eyebrow">Register</p>
            <h1 className="dashboard-title">Internal user onboarding</h1>
            <p className="subtle">Create new accounts based on the permissions of your current role.</p>
          </div>
          <div className="dashboard-actions">
            <Link className="inline-link" to="/monitor">
              Back to monitor
            </Link>
            <button type="button" className="secondary-button" onClick={auth.logout}>
              Log out
            </button>
          </div>
        </div>

        <RoleSummaryCards currentRole={auth.user.role} />

        <UserCreateForm
          centers={centers}
          centersError={centersError}
          form={form}
          isSubmitting={isSubmitting}
          roleOptions={roleOptions}
          status={status}
          onAddPreferenceRow={addPreferenceRow}
          onFieldChange={updateField}
          onPreferenceChange={updatePreference}
          onRemovePreferenceRow={removePreferenceRow}
          onSubmit={handleSubmit}
        />
      </section>
    </main>
  );
}

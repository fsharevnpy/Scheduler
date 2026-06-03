import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

import AppNotificationBell from "../../components/AppNotificationBell.jsx";
import UserAvatar from "../../components/UserAvatar.jsx";
import { requestJson } from "../../lib/http.js";
import { getRoleTitle } from "../../lib/roles.js";
import StatusPill from "../monitor/StatusPill.jsx";
import { formatTimeValue, formatValue } from "../monitor/monitorUtils.js";
import UserCreateForm from "./UserCreateForm.jsx";

const CLASS_DAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

const EMPTY_PREFERENCE = {
  class_id: "",
};

const EMPTY_CLASS_FORM = {
  day_of_week: "",
  center_id: "",
  start_time: "",
  end_time: "",
  teacher_id: "",
};

function renderTeacherNames(label) {
  if (!label || label === "-") {
    return <span>-</span>;
  }

  return (
    <span className="class-teacher-list">
      {String(label)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => (
          <span key={item}>{item}</span>
        ))}
    </span>
  );
}

function formatTimeDraft(value) {
  const digits = value.replace(/\D/g, "").slice(0, 4);

  if (digits.length === 0) {
    return "";
  }

  if (digits.length === 1) {
    return digits;
  }

  if (digits.length === 2) {
    const hour = Number.parseInt(digits, 10);

    if (hour <= 23) {
      return `${digits}:`;
    }

    return `0${digits[0]}:${digits[1]}`;
  }

  if (digits.length === 3) {
    if (digits[0] === "0") {
      return `${digits.slice(0, 2)}:${digits[2]}`;
    }

    const hour = Number.parseInt(digits.slice(0, 2), 10);
    if (hour <= 23) {
      return `${digits.slice(0, 2)}:${digits[2]}`;
    }

    return `0${digits[0]}:${digits.slice(1)}`;
  }

  if (digits[0] === "0") {
    return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  }

  const hour = Number.parseInt(digits.slice(0, 2), 10);
  if (hour <= 23) {
    return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  }

  return `0${digits[0]}:${digits.slice(1, 3)}`;
}

export default function RegisterPage({ auth }) {
  const roleOptions = useMemo(
    () => (auth.user.role === "developer" ? ["developer", "manager", "teacher"] : ["manager", "teacher"]),
    [auth.user.role],
  );

  const [form, setForm] = useState({
    display_name: "",
    role: roleOptions[0],
    name: "",
    contact: "",
    email: "",
    elo: 0,
    max_slots_per_day: 2,
    preferences: [{ ...EMPTY_PREFERENCE }],
  });
  const [status, setStatus] = useState({ kind: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [centers, setCenters] = useState([]);
  const [centersError, setCentersError] = useState("");
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classForm, setClassForm] = useState({ ...EMPTY_CLASS_FORM });
  const [classStatus, setClassStatus] = useState({ kind: "", message: "" });
  const [isClassSubmitting, setIsClassSubmitting] = useState(false);
  const [pendingClassDelete, setPendingClassDelete] = useState("");
  const [classCenterPage, setClassCenterPage] = useState(1);

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${auth.token}`,
    }),
    [auth.token],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadRegisterData() {
      if (!auth.token) {
        return;
      }

      try {
        const [centerData, classData, teacherData] = await Promise.all([
          requestJson(`${auth.apiBase}/centers`, { headers: authHeaders }),
          requestJson(`${auth.apiBase}/classes`, { headers: authHeaders }),
          requestJson(`${auth.apiBase}/teachers`, { headers: authHeaders }),
        ]);

        if (!cancelled) {
          setCenters(centerData);
          setClasses(classData);
          setTeachers(teacherData);
          setCentersError("");
        }
      } catch (error) {
        if (!cancelled) {
          setCenters([]);
          setClasses([]);
          setTeachers([]);
          setCentersError(error.message);
        }
      }
    }

    loadRegisterData();
    return () => {
      cancelled = true;
    };
  }, [auth.apiBase, auth.token, authHeaders]);

  const teachersById = useMemo(() => new Map(teachers.map((teacher) => [teacher.teacher_id, teacher.name])), [teachers]);
  const classesByCenter = useMemo(
    () =>
      classes.reduce((groups, item) => {
        const center = centers.find((centerItem) => centerItem.center_id === item.center_id);
        const key = item.center_id || "UNKNOWN";
        if (!groups[key]) {
          groups[key] = {
            centerId: key,
            label: center ? `${center.name} (${center.center_id})` : key,
            classes: [],
          };
        }
        groups[key].classes.push({
          ...item,
          teacher_label:
            item.teacher_labels?.length > 0
              ? item.teacher_labels
                  .map((label) => String(label).replace(/^[^-]+ - /, ""))
                  .join(", ")
              : item.teacher_id
                ? teachersById.get(item.teacher_id) || "-"
                : "-",
        });
        return groups;
      }, {}),
    [centers, classes, teachersById],
  );
  const classCenterEntries = useMemo(
    () => Object.values(classesByCenter).sort((left, right) => left.centerId.localeCompare(right.centerId)),
    [classesByCenter],
  );
  const classCenterPageCount = Math.max(1, classCenterEntries.length);
  const currentCenterEntry = classCenterEntries[Math.min(classCenterPage - 1, classCenterPageCount - 1)] || null;
  const currentCenterLabel = currentCenterEntry?.label || "";
  const currentCenterClasses = currentCenterEntry?.classes || [];

  useEffect(() => {
    setClassCenterPage((current) => Math.min(current, classCenterPageCount));
  }, [classCenterPageCount]);

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

  function updateClassField(key, value) {
    const nextValue = key === "start_time" || key === "end_time" ? formatTimeDraft(value) : value;
    setClassForm((current) => ({ ...current, [key]: nextValue }));
  }

  async function reloadClasses() {
    const data = await requestJson(`${auth.apiBase}/classes`, { headers: authHeaders });
    setClasses(data);
  }

  async function handleClassSubmit(event) {
    event.preventDefault();
    setIsClassSubmitting(true);
    setClassStatus({ kind: "", message: "Creating class..." });

    try {
      const payload = {
        day_of_week: classForm.day_of_week,
        center_id: classForm.center_id,
        start_time: classForm.start_time,
        end_time: classForm.end_time,
        teacher_id: classForm.teacher_id || null,
      };

      const createdClass = await requestJson(`${auth.apiBase}/classes`, {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      await reloadClasses();
      setClassForm({ ...EMPTY_CLASS_FORM });
      setClassStatus({ kind: "success", message: `Created class ${createdClass.class_id}.` });
    } catch (error) {
      setClassStatus({ kind: "error", message: error.message });
    } finally {
      setIsClassSubmitting(false);
    }
  }

  async function handleDeleteClass(classId) {
    if (!confirm(`Delete class ${classId}?`)) {
      return;
    }

    setPendingClassDelete(classId);
    setClassStatus({ kind: "", message: "Deleting class..." });

    try {
      await requestJson(`${auth.apiBase}/classes/${classId}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      await reloadClasses();
      setClassStatus({ kind: "success", message: `Deleted class ${classId}.` });
    } catch (error) {
      setClassStatus({ kind: "error", message: error.message });
    } finally {
      setPendingClassDelete("");
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus({ kind: "", message: "Creating user..." });

    try {
      if (form.role === "teacher") {
        const preferences = [];
        for (const preference of form.preferences) {
          const classId = preference.class_id.trim();
          if (!classId) {
            continue;
          }

          const selectedClass = classes.find((item) => item.class_id === classId);
          if (!selectedClass) {
            throw new Error("Each preference row must select an existing class.");
          }

          preferences.push({
            preferred_center_id: selectedClass.center_id,
            day_of_week: selectedClass.day_of_week,
            preferred_start_time: selectedClass.start_time,
            preferred_end_time: selectedClass.end_time,
          });
        }

        const payload = {
          role: form.role,
          name: form.name.trim(),
          contact: form.contact.trim(),
          email: form.email.trim(),
          elo: Number(form.elo),
          max_slots_per_day: Number(form.max_slots_per_day),
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
          message: `Created teacher account ${createdUser.display_name} (${createdUser.user_code}, ${createdUser.teacher_id}).`,
        });
      } else {
        const payload = {
          display_name: form.display_name.trim(),
          role: form.role,
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
          message: `Created ${createdUser.role} account ${createdUser.display_name} (${createdUser.user_code}).`,
        });
      }
      setForm({
        display_name: "",
        role: roleOptions[0],
        name: "",
        contact: "",
        email: "",
        elo: 0,
        max_slots_per_day: 2,
        preferences: [{ ...EMPTY_PREFERENCE }],
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
            <AppNotificationBell auth={auth} />
            <div className="account-chip">
              <UserAvatar
                apiBase={auth.apiBase}
                imageUrl={auth.user?.profile_image_url}
                name={auth.user?.display_name}
                fallbackCode={auth.user?.user_code}
                size="medium"
              />
              <div className="account-chip-copy">
                <strong>{getRoleTitle(auth.user?.role)}</strong>
                <span>{auth.user?.user_code}</span>
              </div>
            </div>
            <div className="dashboard-action-stack">
              <button type="button" className="secondary-button" onClick={auth.logout}>
                Log out
              </button>
              <Link className="inline-link" to="/profile-settings">
                Profile Settings
              </Link>
              <Link className="inline-link" to="/monitor">
                Back to monitor
              </Link>
            </div>
          </div>
        </div>

        <UserCreateForm
          centers={centers}
          centersError={centersError}
          classes={classes}
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

        <section className="dashboard-section">
          <div className="section-head">
            <div>
              <p className="eyebrow">Class Management</p>
              <h2>Create and delete classes</h2>
            </div>
          </div>

          <form className="auth-form class-create-form" onSubmit={handleClassSubmit}>
            <label className="field">
              <span>Day</span>
              <select
                value={classForm.day_of_week}
                onChange={(event) => updateClassField("day_of_week", event.target.value)}
                required
              >
                <option value="">Select day</option>
                <option value="T2">T2</option>
                <option value="T3">T3</option>
                <option value="T4">T4</option>
                <option value="T5">T5</option>
                <option value="T6">T6</option>
                <option value="T7">T7</option>
                <option value="CN">CN</option>
              </select>
            </label>

            <label className="field">
              <span>Center</span>
              <select
                value={classForm.center_id}
                onChange={(event) => updateClassField("center_id", event.target.value)}
                required
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
              <span>Start Time</span>
              <input
                value={classForm.start_time}
                onChange={(event) => updateClassField("start_time", event.target.value)}
                type="text"
                inputMode="numeric"
                placeholder="HH:MM"
                maxLength="5"
                required
              />
            </label>

            <label className="field">
              <span>End Time</span>
              <input
                value={classForm.end_time}
                onChange={(event) => updateClassField("end_time", event.target.value)}
                type="text"
                inputMode="numeric"
                placeholder="HH:MM"
                maxLength="5"
                required
              />
            </label>

            <label className="field">
              <span>Teacher</span>
              <select value={classForm.teacher_id} onChange={(event) => updateClassField("teacher_id", event.target.value)}>
                <option value="">Unassigned</option>
                {teachers.map((teacher) => (
                  <option key={teacher.teacher_id} value={teacher.teacher_id}>
                    {teacher.teacher_id} - {teacher.name}
                  </option>
                ))}
              </select>
            </label>

            <button className="primary-button" type="submit" disabled={isClassSubmitting}>
              {isClassSubmitting ? "Creating..." : "Create class"}
            </button>
          </form>

          <div className={`status ${classStatus.kind}`.trim()} aria-live="polite">
            {classStatus.message}
          </div>

          {classes.length === 0 ? (
            <p className="subtle">No classes found.</p>
          ) : (
            <div className="center-class-group">
              <div className="center-class-head">
                <div>
                  <h3>{currentCenterLabel}</h3>
                  <span className="subtle">{currentCenterClasses.length} classes</span>
                </div>
                <span className="subtle">
                  Center {classCenterPage} of {classCenterPageCount}
                </span>
              </div>

              <div className="class-week-grid" role="table" aria-label={`${currentCenterLabel} classes by weekday`}>
                {CLASS_DAYS.map((day) => {
                  const dayClasses = currentCenterClasses
                    .filter((item) => item.day_of_week === day)
                    .sort((left, right) => String(left.start_time).localeCompare(String(right.start_time)));

                  return (
                    <div className="class-week-column" role="cell" key={`${currentCenterLabel}-${day}`}>
                      <div className="class-week-day">{day}</div>
                      <div className="class-week-list">
                        {dayClasses.length === 0 ? (
                          <span className="class-week-empty">No classes</span>
                        ) : (
                          dayClasses.map((item) => (
                            <article className="class-week-item" key={item.class_id}>
                              <div className="class-week-item-head">
                                <StatusPill value={item.status} />
                              </div>
                              <span>
                                {formatTimeValue(item.start_time)} - {formatTimeValue(item.end_time)}
                              </span>
                              {renderTeacherNames(item.teacher_label)}
                              <button
                                type="button"
                                className="table-action-button table-action-button-muted class-week-delete-button"
                                disabled={pendingClassDelete === item.class_id}
                                onClick={() => handleDeleteClass(item.class_id)}
                              >
                                {pendingClassDelete === item.class_id ? "Deleting..." : "Delete"}
                              </button>
                            </article>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="table-pagination class-center-pagination">
                <span>
                  {currentCenterLabel} | {classCenterPage} of {classCenterPageCount}
                </span>
                <div className="table-pagination-actions">
                  <button
                    type="button"
                    className="table-action-button table-action-button-muted"
                    disabled={classCenterPage === 1}
                    onClick={() => setClassCenterPage((current) => Math.max(1, current - 1))}
                  >
                    Previous center
                  </button>
                  <button
                    type="button"
                    className="table-action-button"
                    disabled={classCenterPage === classCenterPageCount}
                    onClick={() => setClassCenterPage((current) => Math.min(classCenterPageCount, current + 1))}
                  >
                    Next center
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

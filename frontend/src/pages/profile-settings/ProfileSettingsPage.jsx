import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

import AppNotificationBell from "../../components/AppNotificationBell.jsx";
import LanguageToggle from "../../components/LanguageToggle.jsx";
import UserAvatar from "../../components/UserAvatar.jsx";
import { useLanguage } from "../../lib/i18n.jsx";
import { getRoleTitle } from "../../lib/roles.js";
import FloatingPanel from "../monitor/FloatingPanel.jsx";
import PasswordSettingsPanel from "../monitor/PasswordSettingsPanel.jsx";
import { requestJson } from "../../lib/http.js";
import { buildTeacherEventsWebSocketUrl } from "../../lib/teacherEvents.js";

function parseProfileEventValue(field, value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (field === "elo" || field === "max_slots_per_day") {
    return Number.parseInt(value, 10);
  }

  if (field === "education_score") {
    return Number.parseFloat(value);
  }

  return value;
}

export default function ProfileSettingsPage({ auth }) {
  const { t } = useLanguage();
  const [status, setStatus] = useState({ kind: "", message: "" });
  const [imageStatus, setImageStatus] = useState({ kind: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSavingContactChange, setIsSavingContactChange] = useState(false);
  const [teacherProfile, setTeacherProfile] = useState(null);
  const [teacherProfileError, setTeacherProfileError] = useState("");
  const [teacherRealtimeStatus, setTeacherRealtimeStatus] = useState({ kind: "", message: "" });
  const [contactStatus, setContactStatus] = useState({ kind: "", message: "" });
  const [contactEditField, setContactEditField] = useState(null);
  const [contactDraft, setContactDraft] = useState("");
  const [form, setForm] = useState({
    current_password: "",
    new_password: "",
    confirm_new_password: "",
  });

  useEffect(() => {
    let cancelled = false;

    async function loadTeacherProfile() {
      if (auth.user?.role !== "teacher") {
        setTeacherProfile(null);
        setTeacherProfileError("");
        return;
      }

      try {
        const profile = await requestJson(`${auth.apiBase}/teachers/me`, {
          headers: {
            Authorization: `Bearer ${auth.token}`,
          },
        });

        if (!cancelled) {
          setTeacherProfile(profile);
          setTeacherProfileError("");
        }
      } catch (error) {
        if (!cancelled) {
          setTeacherProfile(null);
          setTeacherProfileError(error.message);
        }
      }
    }

    loadTeacherProfile();
    return () => {
      cancelled = true;
    };
  }, [auth.apiBase, auth.token, auth.user?.role, t]);

  useEffect(() => {
    if (auth.user?.role !== "teacher" || !auth.token) {
      return undefined;
    }

    let socket = null;
    let reconnectTimer = null;
    let isClosedByEffect = false;

    function connect() {
      socket = new WebSocket(buildTeacherEventsWebSocketUrl(auth.apiBase, auth.token));

      socket.onmessage = (message) => {
        const payload = JSON.parse(message.data);
        if (payload.type !== "teacher_event" || payload.event?.event_type !== "PROFILE") {
          return;
        }

        const { profile_field: field, new_value: newValue, reason } = payload.event;
        if (!field) {
          return;
        }

        setTeacherProfile((current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            [field]: parseProfileEventValue(field, newValue),
          };
        });
        setTeacherRealtimeStatus({ kind: "success", message: reason || t("teacherProfileUpdated") });
      };

      socket.onclose = () => {
        if (!isClosedByEffect) {
          reconnectTimer = window.setTimeout(connect, 3000);
        }
      };
    }

    connect();

    return () => {
      isClosedByEffect = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      if (socket) {
        socket.close();
      }
    };
  }, [auth.apiBase, auth.token, auth.user?.role]);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus({ kind: "", message: "" });

    try {
      await requestJson(`${auth.apiBase}/auth/profile/password`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${auth.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });
      setStatus({ kind: "success", message: t("passwordChanged") });
      setForm({
        current_password: "",
        new_password: "",
        confirm_new_password: "",
      });
    } catch (error) {
      setStatus({ kind: "error", message: error.message });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleProfileImageChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setIsUploadingImage(true);
    setImageStatus({ kind: "", message: t("uploadingProfileImage") });

    try {
      const formData = new FormData();
      formData.append("file", file);

      const updatedUser = await requestJson(`${auth.apiBase}/auth/profile/image`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${auth.token}`,
        },
        body: formData,
      });

      const cacheBustedUser = {
        ...updatedUser,
        profile_image_url: updatedUser.profile_image_url
          ? `${updatedUser.profile_image_url}${updatedUser.profile_image_url.includes("?") ? "&" : "?"}v=${Date.now()}`
          : updatedUser.profile_image_url,
      };

      auth.updateUser(cacheBustedUser);
      setImageStatus({ kind: "success", message: t("profileImageUpdated") });
    } catch (error) {
      setImageStatus({ kind: "error", message: error.message });
    } finally {
      setIsUploadingImage(false);
    }
  }

  async function handleSaveContactChange(event) {
    event.preventDefault();
    if (!contactEditField) {
      return;
    }

    setIsSavingContactChange(true);
    setContactStatus({ kind: "", message: "" });

    try {
      const updatedProfile = await requestJson(`${auth.apiBase}/auth/profile/contact`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${auth.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          field: contactEditField,
          value: contactDraft,
        }),
      });

      setTeacherProfile((current) => ({
        ...(current || {}),
        [updatedProfile.field]: updatedProfile.value,
      }));
      closeContactEditPanel();
      setContactStatus({ kind: "success", message: t("contactDetailsUpdated") });
    } catch (error) {
      setContactStatus({ kind: "error", message: error.message });
    } finally {
      setIsSavingContactChange(false);
    }
  }

  function openContactEditPanel(field) {
    setContactEditField(field);
    setContactDraft(field === "email" ? teacherProfile?.email || "" : teacherProfile?.contact || "");
    setContactStatus({ kind: "", message: "" });
  }

  function closeContactEditPanel() {
    setContactEditField(null);
    setContactDraft("");
  }

  const contactEditLabel = contactEditField === "email" ? t("personalEmail") : t("phone");
  const contactEditCurrentValue =
    contactEditField === "email" ? teacherProfile?.email || "" : teacherProfile?.contact || "";
  const hasContactChanges = Boolean(contactEditField) && contactDraft.trim() !== contactEditCurrentValue;

  return (
    <main className="dashboard-shell">
      <section className="dashboard-card dashboard-card-wide">
        <div className="dashboard-head">
          <div>
            <p className="eyebrow">{t("account")}</p>
            <h1 className="dashboard-title">{t("profileSettings")}</h1>
            <p className="subtle">{t("profileSettingsCopy")}</p>
          </div>
          <div className="dashboard-actions">
            <AppNotificationBell auth={auth} />
            <LanguageToggle />
            <div className="account-chip">
              <UserAvatar
                apiBase={auth.apiBase}
                imageUrl={auth.user?.profile_image_url}
                name={auth.user?.display_name}
                fallbackCode={auth.user?.user_code}
                size="medium"
              />
              <div className="account-chip-copy">
                <strong>{getRoleTitle(auth.user?.role, t)}</strong>
                <span>{auth.user?.user_code}</span>
              </div>
            </div>
            <div className="dashboard-action-stack">
              <button type="button" className="secondary-button" onClick={auth.logout}>
                {t("logout")}
              </button>
              <Link className="inline-link" to="/monitor">
                {t("monitor")}
              </Link>
              {(auth.user?.role === "developer" || auth.user?.role === "manager") && (
                <Link className="inline-link" to="/register">
                  {t("openRegisterScreen")}
                </Link>
              )}
            </div>
          </div>
        </div>

        {auth.user?.role === "teacher" ? (
          <section className="dashboard-section">
            <div className="section-head">
              <div>
                <p className="eyebrow">{t("teacherProfile")}</p>
                <h2>{t("basicInformation")}</h2>
              </div>
            </div>

            {teacherProfileError ? <div className="status error">{teacherProfileError}</div> : null}

            {teacherProfile ? (
              <article className="teacher-profile-card">
                <div className="teacher-profile-identity">
                  <label className="teacher-profile-avatar-trigger">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden-file-input"
                      onChange={handleProfileImageChange}
                    />
                    <UserAvatar
                      apiBase={auth.apiBase}
                      imageUrl={auth.user?.profile_image_url}
                      name={teacherProfile.name || auth.user?.display_name}
                      fallbackCode={auth.user?.user_code}
                      size="large"
                      className="teacher-profile-avatar"
                    />
                    <span className="teacher-profile-avatar-overlay">
                      {isUploadingImage ? t("uploading") : t("updatePhoto")}
                    </span>
                  </label>
                  <div className="teacher-profile-identity-copy">
                    <strong>{teacherProfile.name || auth.user?.display_name || "-"}</strong>
                    <span>{auth.user?.user_code || "-"}</span>
                  </div>
                  <div className={`status ${imageStatus.kind}`.trim()} aria-live="polite">
                    {imageStatus.message}
                  </div>
                </div>

                <div className="teacher-profile-details">
                  <div className="teacher-profile-row">
                    <span>{t("teacherId")}</span>
                    <strong>{teacherProfile.teacher_id || auth.user?.teacher_id || "-"}</strong>
                  </div>
                  <div className="teacher-profile-row">
                    <span>{t("phone")}</span>
                    <button
                      type="button"
                      className="teacher-profile-edit-value"
                      onClick={() => openContactEditPanel("contact")}
                    >
                      {teacherProfile.contact || "-"}
                    </button>
                  </div>
                  <div className="teacher-profile-row">
                    <span>{t("personalEmail")}</span>
                    <button
                      type="button"
                      className="teacher-profile-edit-value"
                      onClick={() => openContactEditPanel("email")}
                    >
                      {teacherProfile.email || "-"}
                    </button>
                  </div>
                  <div className="teacher-profile-row">
                    <span>ELO</span>
                    <strong>{teacherProfile.elo ?? "-"}</strong>
                  </div>
                  <div className="teacher-profile-row">
                    <span>{t("educationScore")}</span>
                    <strong>
                      {teacherProfile.education_score == null
                        ? t("pendingOutOfTen")
                        : `${teacherProfile.education_score}/10`}
                    </strong>
                  </div>
                </div>
              </article>
            ) : (
              <p className="subtle">{t("teacherProfileUnavailable")}</p>
            )}

            {!contactEditField ? (
              <div className={`status ${contactStatus.kind}`.trim()} aria-live="polite">
                {contactStatus.message}
              </div>
            ) : null}
            <div className={`status ${teacherRealtimeStatus.kind}`.trim()} aria-live="polite">
              {teacherRealtimeStatus.message}
            </div>
          </section>
        ) : (
          <section className="dashboard-section">
            <div className="section-head">
              <div>
                <p className="eyebrow">{t("accountProfile")}</p>
                <h2>{t("basicInformation")}</h2>
              </div>
            </div>

            <article className="teacher-profile-card">
              <div className="teacher-profile-identity">
                <label className="teacher-profile-avatar-trigger">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden-file-input"
                    onChange={handleProfileImageChange}
                  />
                  <UserAvatar
                    apiBase={auth.apiBase}
                    imageUrl={auth.user?.profile_image_url}
                    name={auth.user?.display_name}
                    fallbackCode={auth.user?.user_code}
                    size="large"
                    className="teacher-profile-avatar"
                  />
                  <span className="teacher-profile-avatar-overlay">
                    {isUploadingImage ? t("uploading") : t("updatePhoto")}
                  </span>
                </label>
                <div className="teacher-profile-identity-copy">
                  <strong>{auth.user?.display_name || "-"}</strong>
                  <span>{auth.user?.user_code || "-"}</span>
                </div>
                <div className={`status ${imageStatus.kind}`.trim()} aria-live="polite">
                  {imageStatus.message}
                </div>
              </div>

              <div className="teacher-profile-details">
                <div className="teacher-profile-row">
                  <span>{t("role")}</span>
                  <strong>{getRoleTitle(auth.user?.role, t)}</strong>
                </div>
                <div className="teacher-profile-row">
                  <span>{t("userCode")}</span>
                  <strong>{auth.user?.user_code || "-"}</strong>
                </div>
                <div className="teacher-profile-row">
                  <span>{t("displayName")}</span>
                  <strong>{auth.user?.display_name || "-"}</strong>
                </div>
              </div>
            </article>
          </section>
        )}

        {contactEditField ? (
          <FloatingPanel
            eyebrow={t("contactChange")}
            title={t("editField", { label: contactEditLabel })}
            titleId="contact-change-title"
            onClose={closeContactEditPanel}
          >
            <form className="floating-panel-form" onSubmit={handleSaveContactChange}>
              <label className="field">
                <span>{t("newField", { label: contactEditLabel })}</span>
                <input
                  value={contactDraft}
                  onChange={(event) => {
                    setContactDraft(event.target.value);
                    setContactStatus({ kind: "", message: "" });
                  }}
                  type={contactEditField === "email" ? "email" : "tel"}
                  autoComplete={contactEditField === "email" ? "email" : "tel"}
                  required
                />
              </label>

              <div className={`status ${contactStatus.kind}`.trim()} aria-live="polite">
                {contactStatus.message}
              </div>

              <div className="floating-panel-actions">
                <button
                  type="submit"
                  className="table-action-button"
                  disabled={!hasContactChanges || isSavingContactChange}
                >
                  {isSavingContactChange ? t("saving") : t("saveChange")}
                </button>
                <button
                  type="button"
                  className="table-action-button table-action-button-muted"
                  disabled={isSavingContactChange}
                  onClick={closeContactEditPanel}
                >
                  {t("cancel")}
                </button>
              </div>
            </form>
          </FloatingPanel>
        ) : null}

        <PasswordSettingsPanel
          form={form}
          pendingAction={isSubmitting ? "change-password" : ""}
          status={status}
          onFieldChange={(key, value) => setForm((current) => ({ ...current, [key]: value }))}
          onSubmit={handleSubmit}
        />
      </section>
    </main>
  );
}

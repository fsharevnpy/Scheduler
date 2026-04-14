import { Link } from "react-router-dom";
import { useState } from "react";

import UserAvatar from "../../components/UserAvatar.jsx";
import { getRoleTitle } from "../../lib/roles.js";
import ChangePasswordPanel from "../monitor/ChangePasswordPanel.jsx";
import { requestJson } from "../../lib/http.js";

export default function ChangePasswordPage({ auth }) {
  const [status, setStatus] = useState({ kind: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    current_password: "",
    new_password: "",
    confirm_new_password: "",
  });

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus({ kind: "", message: "" });

    try {
      await requestJson(`${auth.apiBase}/auth/change-password`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${auth.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });
      setStatus({ kind: "success", message: "Password changed successfully." });
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

  return (
    <main className="dashboard-shell">
      <section className="dashboard-card dashboard-card-wide">
        <div className="dashboard-head">
          <div>
            <p className="eyebrow">Account</p>
            <h1 className="dashboard-title">Change password</h1>
            <p className="subtle">Update your account password with your current password for verification.</p>
          </div>
          <div className="dashboard-actions">
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
              <Link className="inline-link" to="/monitor">
                Back to monitor
              </Link>
              {(auth.user?.role === "developer" || auth.user?.role === "manager") && (
                <Link className="inline-link" to="/register">
                  Open register screen
                </Link>
              )}
            </div>
          </div>
        </div>

        <ChangePasswordPanel
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

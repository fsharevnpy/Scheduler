import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../lib/i18n.jsx";
import { getRoleTitle } from "../lib/roles.js";
import UserAvatar from "./UserAvatar.jsx";
import WebPushControl from "./WebPushControl.jsx";

export default function AccountMenu({ auth }) {
  const { t } = useLanguage();
  const menu = useRef(null);
  const { user } = auth;

  useEffect(() => {
    function closeOutside(event) {
      if (menu.current && !menu.current.contains(event.target)) menu.current.open = false;
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  return (
    <details className="manager-account-menu" ref={menu} onKeyDown={(event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        menu.current.open = false;
        menu.current.querySelector("summary").focus({ preventScroll: true });
      }
    }}>
      <summary className="account-chip">
        <UserAvatar apiBase={auth.apiBase} imageUrl={user.profile_image_url}
          name={user.display_name} fallbackCode={user.user_code} size="medium" />
        <span>{t("account")}</span><span aria-hidden="true">&#9662;</span>
      </summary>
      <div className="manager-account-popover">
        <div className="account-chip-copy">
          <strong>{user.display_name || user.user_code}</strong>
          <span>{getRoleTitle(user.role, t)} | {user.user_code}</span>
          {user.teacher_id ? <span>{user.teacher_id}</span> : null}
        </div>
        <Link className="inline-link" to="/profile-settings">{t("profileSettings")}</Link>
        <WebPushControl auth={auth} />
        <button type="button" className="secondary-button" onClick={auth.logout}>{t("logout")}</button>
      </div>
    </details>
  );
}

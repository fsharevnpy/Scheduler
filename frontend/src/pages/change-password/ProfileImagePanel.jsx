import { useRef } from "react";

import UserAvatar from "../../components/UserAvatar.jsx";

const IMAGE_HELP = "JPG, PNG, or WEBP up to 2MB.";

export default function ProfileImagePanel({
  auth,
  isUploading,
  status,
  onFileChange,
}) {
  const inputRef = useRef(null);

  return (
    <section className="dashboard-section">
      <div className="section-head">
        <div>
          <p className="eyebrow">Profile</p>
          <h2>Profile Picture</h2>
        </div>
      </div>

      <div className="profile-image-panel">
        <UserAvatar
          apiBase={auth.apiBase}
          imageUrl={auth.user?.profile_image_url}
          name={auth.user?.display_name}
          fallbackCode={auth.user?.user_code}
          size="large"
        />

        <div className="profile-image-copy">
          <strong>{auth.user?.display_name || auth.user?.user_code}</strong>
          <p className="subtle">{IMAGE_HELP}</p>
          <div className="profile-image-actions">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden-file-input"
              onChange={onFileChange}
            />
            <button
              type="button"
              className="primary-button form-button-fit"
              disabled={isUploading}
              onClick={() => inputRef.current?.click()}
            >
              {isUploading ? "Uploading..." : "Upload image"}
            </button>
          </div>
        </div>
      </div>

      <div className={`status ${status.kind}`.trim()} aria-live="polite">
        {status.message}
      </div>
    </section>
  );
}

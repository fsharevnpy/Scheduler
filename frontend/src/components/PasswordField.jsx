import { useState } from "react";

import { useLanguage } from "../lib/i18n.jsx";

function EyeIcon({ visible }) {
  return (
    <svg className="password-toggle-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="12"
        r="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      {visible ? null : (
        <path
          d="M4 4l16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export default function PasswordField({
  id,
  label = "Password",
  value,
  onChange,
  autoComplete,
  required = false,
  helpText,
}) {
  const [visible, setVisible] = useState(false);
  const { t } = useLanguage();

  return (
    <label className="field">
      <div className="field-head">
        <span>{label}</span>
        <button
          type="button"
          className="password-toggle"
          aria-label={visible ? t("hidePassword", { label }) : t("showPassword", { label })}
          onClick={() => setVisible((current) => !current)}
        >
          <EyeIcon visible={visible} />
        </button>
      </div>
      <input
        id={id}
        value={value}
        onChange={onChange}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required={required}
      />
      {helpText ? <small className="field-help">{helpText}</small> : null}
    </label>
  );
}

import { useLanguage } from "../lib/i18n.jsx";

export default function LanguageToggle() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="language-toggle" aria-label={t("language")}>
      <button
        type="button"
        className={language === "vi" ? "active" : ""}
        onClick={() => setLanguage("vi")}
      >
        VI
      </button>
      <button
        type="button"
        className={language === "en" ? "active" : ""}
        onClick={() => setLanguage("en")}
      >
        EN
      </button>
    </div>
  );
}

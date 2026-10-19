import { useState } from "react";
import "./BackupManagement.css";
import { useLanguage } from "../../lib/i18n.jsx";

async function getErrorMessage(response, fallback) {
  const data = await response.json().catch(() => ({}));
  return data.detail || fallback;
}

export default function BackupManagement({ apiBase, token }) {
  const { t, language } = useLanguage();
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(null);
  const [isListVisible, setIsListVisible] = useState(false);

  const authHeaders = {
    Authorization: `Bearer ${token}`,
  };

  const loadBackups = async () => {
    if (!token) {
      setBackups([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${apiBase}/admin/backups`, {
        headers: authHeaders,
      });
      if (!response.ok) throw new Error(await getErrorMessage(response, t("Failed to load backups")));
      const data = await response.json();
      setBackups(data.backups || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleViewBackups = async () => {
    if (isListVisible) {
      setIsListVisible(false);
      return;
    }

    setIsListVisible(true);
    await loadBackups();
  };

  const handleBackupNow = async () => {
    if (!confirm(t("Create backup now?"))) return;
    setIsListVisible(true);
    try {
      setIsBackingUp(true);
      setError(null);
      const response = await fetch(`${apiBase}/admin/backup`, {
        method: "POST",
        headers: authHeaders,
      });
      if (!response.ok) throw new Error(await getErrorMessage(response, t("Backup failed")));
      await response.json();
      await loadBackups();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleDownload = async (filename) => {
    try {
      const response = await fetch(`${apiBase}/admin/backups/${filename}/download`, {
        headers: authHeaders,
      });
      if (!response.ok) throw new Error(await getErrorMessage(response, t("Download failed")));
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRestoreFull = async (filename) => {
    if (
      !confirm(
        t("⚠️ Restore full database? All data after this backup will be lost.")
      )
    )
      return;
    try {
      setRestoreLoading(filename);
      const response = await fetch(`${apiBase}/admin/backups/${filename}/restore-full`, {
        method: "POST",
        headers: authHeaders,
      });
      if (!response.ok) throw new Error(await getErrorMessage(response, t("Restore failed")));
      setError(null);
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setRestoreLoading(null);
    }
  };

  const handleRestoreMaster = async (filename) => {
    if (
      !confirm(
        t("Restore master data (centers, teachers)? This will not affect classes and leave requests.")
      )
    )
      return;
    try {
      setRestoreLoading(filename);
      const response = await fetch(
        `${apiBase}/admin/backups/${filename}/restore-master`,
        {
          method: "POST",
          headers: authHeaders,
        }
      );
      if (!response.ok) throw new Error(await getErrorMessage(response, t("Restore failed")));
      setError(null);
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setRestoreLoading(null);
    }
  };

  const handleDelete = async (filename) => {
    if (!confirm(t("Delete backup {p0}?", { p0: filename }))) return;
    try {
      const response = await fetch(`${apiBase}/admin/backups/${filename}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!response.ok) throw new Error(await getErrorMessage(response, t("Delete failed")));
      setError(null);
      loadBackups();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="backup-management">
      <h3>{t("Backup Management")}</h3>

      <div className="backup-control">
        <button
          onClick={handleBackupNow}
          disabled={isBackingUp || loading}
          className="btn-backup"
        >
          {isBackingUp ? t("Creating Backup...") : t("BackUp Data")}
        </button>
        <button
          onClick={handleViewBackups}
          disabled={isBackingUp || loading}
          className="btn-view"
        >
          {loading ? t("Loading...") : isListVisible ? t("Hide Backups") : t("View Backups")}
        </button>
      </div>

      {error && <div className="error-message">{t(error)}</div>}

      {isListVisible ? (
        <div className="backup-files">
          <h4>{t("Backup Files (Last 31 Days)")}</h4>
          {loading ? (
            <p className="loading">{t("Loading backups...")}</p>
          ) : backups.length === 0 ? (
            <p className="empty">{t("No backups found")}</p>
          ) : (
            <div className="backup-list">
              {backups.map((backup) => (
                <div key={backup.file} className="backup-item">
                  <div className="backup-info">
                    <div className="backup-name">📦 {backup.file}</div>
                    <div className="backup-meta">
                      {backup.size_mb} MB · {new Date(backup.created).toLocaleString(language === "vi" ? "vi-VN" : "en-GB")}
                    </div>
                  </div>
                  <div className="backup-actions">
                    <button
                      onClick={() => handleDownload(backup.file)}
                      className="btn-small btn-download"
                      title={t("Download")}
                    >{t("⬇ Download")}{" "}</button>
                    <button
                      onClick={() => handleRestoreFull(backup.file)}
                      disabled={restoreLoading === backup.file}
                      className="btn-small btn-restore"
                      title={t("Restore Full Database")}
                    >
                      {restoreLoading === backup.file ? t("Restoring...") : t("⟳ Restore Full")}
                    </button>
                    <button
                      onClick={() => handleRestoreMaster(backup.file)}
                      disabled={restoreLoading === backup.file}
                      className="btn-small btn-restore-master"
                      title={t("Restore Master Data Only")}
                    >
                      {restoreLoading === backup.file ? t("Restoring...") : t("⟳ Restore Master")}
                    </button>
                    <button
                      onClick={() => handleDelete(backup.file)}
                      className="btn-small btn-delete"
                      title={t("Delete")}
                    >{t("🗑 Delete")}{" "}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

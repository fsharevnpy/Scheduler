import { useState } from "react";
import "./BackupManagement.css";

async function getErrorMessage(response, fallback) {
  const data = await response.json().catch(() => ({}));
  return data.detail || fallback;
}

export default function BackupManagement({ apiBase, token, onStatusChange }) {
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
      if (!response.ok) throw new Error(await getErrorMessage(response, "Failed to load backups"));
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
    if (!confirm("Create backup now?")) return;
    setIsListVisible(true);
    try {
      setIsBackingUp(true);
      setError(null);
      const response = await fetch(`${apiBase}/admin/backup`, {
        method: "POST",
        headers: authHeaders,
      });
      if (!response.ok) throw new Error(await getErrorMessage(response, "Backup failed"));
      const data = await response.json();
      onStatusChange?.(`✓ Backup created: ${data.file} (${data.size_mb} MB)`);
      await loadBackups();
    } catch (err) {
      setError(err.message);
      onStatusChange?.(`✗ Backup failed: ${err.message}`);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleDownload = async (filename) => {
    try {
      const response = await fetch(`${apiBase}/admin/backups/${filename}/download`, {
        headers: authHeaders,
      });
      if (!response.ok) throw new Error(await getErrorMessage(response, "Download failed"));
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
        "⚠️ Restore full database? All data after this backup will be lost."
      )
    )
      return;
    try {
      setRestoreLoading(filename);
      const response = await fetch(`${apiBase}/admin/backups/${filename}/restore-full`, {
        method: "POST",
        headers: authHeaders,
      });
      if (!response.ok) throw new Error(await getErrorMessage(response, "Restore failed"));
      setError(null);
      onStatusChange?.(`✓ Database restored from ${filename}`);
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      setError(err.message);
      onStatusChange?.(`✗ Restore failed: ${err.message}`);
    } finally {
      setRestoreLoading(null);
    }
  };

  const handleRestoreMaster = async (filename) => {
    if (
      !confirm(
        "Restore master data (centers, teachers)? This will not affect classes and leave requests."
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
      if (!response.ok) throw new Error(await getErrorMessage(response, "Restore failed"));
      setError(null);
      onStatusChange?.(`✓ Master data restored from ${filename}`);
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      setError(err.message);
      onStatusChange?.(`✗ Restore failed: ${err.message}`);
    } finally {
      setRestoreLoading(null);
    }
  };

  const handleDelete = async (filename) => {
    if (!confirm(`Delete backup ${filename}?`)) return;
    try {
      const response = await fetch(`${apiBase}/admin/backups/${filename}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!response.ok) throw new Error(await getErrorMessage(response, "Delete failed"));
      setError(null);
      onStatusChange?.(`✓ Backup deleted: ${filename}`);
      loadBackups();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="backup-management">
      <h3>Backup Management</h3>

      <div className="backup-control">
        <button
          onClick={handleBackupNow}
          disabled={isBackingUp || loading}
          className="btn-backup"
        >
          {isBackingUp ? "Creating Backup..." : "BackUp Data"}
        </button>
        <button
          onClick={handleViewBackups}
          disabled={isBackingUp || loading}
          className="btn-view"
        >
          {loading ? "Loading..." : isListVisible ? "Hide Backups" : "View Backups"}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {isListVisible ? (
        <div className="backup-files">
          <h4>Backup Files (Last 31 Days)</h4>
          {loading ? (
            <p className="loading">Loading backups...</p>
          ) : backups.length === 0 ? (
            <p className="empty">No backups found</p>
          ) : (
            <div className="backup-list">
              {backups.map((backup) => (
                <div key={backup.file} className="backup-item">
                  <div className="backup-info">
                    <div className="backup-name">📦 {backup.file}</div>
                    <div className="backup-meta">
                      {backup.size_mb} MB · {new Date(backup.created).toLocaleString()}
                    </div>
                  </div>
                  <div className="backup-actions">
                    <button
                      onClick={() => handleDownload(backup.file)}
                      className="btn-small btn-download"
                      title="Download"
                    >
                      ⬇ Download
                    </button>
                    <button
                      onClick={() => handleRestoreFull(backup.file)}
                      disabled={restoreLoading === backup.file}
                      className="btn-small btn-restore"
                      title="Restore Full Database"
                    >
                      {restoreLoading === backup.file ? "Restoring..." : "⟳ Restore Full"}
                    </button>
                    <button
                      onClick={() => handleRestoreMaster(backup.file)}
                      disabled={restoreLoading === backup.file}
                      className="btn-small btn-restore-master"
                      title="Restore Master Data Only"
                    >
                      {restoreLoading === backup.file ? "Restoring..." : "⟳ Restore Master"}
                    </button>
                    <button
                      onClick={() => handleDelete(backup.file)}
                      className="btn-small btn-delete"
                      title="Delete"
                    >
                      🗑 Delete
                    </button>
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

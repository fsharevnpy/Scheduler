#!/bin/bash

# Backup script for Scheduler database and MinIO
# Usage: ./backup.sh [output_dir]

set -e

BACKUP_DIR="${1:-.}"
TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
BACKUP_FILE="scheduler_backup_${TIMESTAMP}.tar.gz"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILE}"

# Database credentials (from environment or defaults)
DB_USER="${POSTGRES_USER:-chessfighter}"
DB_PASSWORD="${POSTGRES_PASSWORD:-123456}"
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-scheduler}"

# MinIO data path
MINIO_DATA_PATH="${MINIO_DATA_PATH:-/minio_data}"

echo "[$(date +'%Y-%m-%d %H:%M:%S')] Starting backup to: $BACKUP_PATH"

# Create backup directory if not exists
mkdir -p "$BACKUP_DIR"

# Create temporary directory for backup files
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Backup database
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Dumping PostgreSQL database..."
PGPASSWORD="$DB_PASSWORD" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --format=plain \
  > "${TEMP_DIR}/database.sql" 2>/dev/null || {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] Database dump failed"
  exit 1
}

echo "[$(date +'%Y-%m-%d %H:%M:%S')] Database dump completed"

# Backup MinIO data (if exists)
if [ -d "$MINIO_DATA_PATH" ]; then
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] Backing up MinIO data..."
  cp -r "$MINIO_DATA_PATH" "${TEMP_DIR}/minio_data" 2>/dev/null || true
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] MinIO backup completed"
fi

# Create tar.gz archive
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Creating compressed archive..."
tar -czf "$BACKUP_PATH" -C "$TEMP_DIR" . 2>/dev/null || {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] Archive creation failed"
  exit 1
}

echo "[$(date +'%Y-%m-%d %H:%M:%S')] Backup completed: $BACKUP_PATH"

# Get file size
SIZE=$(du -h "$BACKUP_PATH" | cut -f1)
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Backup file size: $SIZE"

# Cleanup old backups (keep only last 31 days)
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Cleaning up old backups..."
find "$BACKUP_DIR" -name "scheduler_backup_*.tar.gz" -type f -mtime +31 -delete 2>/dev/null || true
echo "[$(date +'%Y-%m-%d %H:%M:%S')] Cleanup completed"

echo "[$(date +'%Y-%m-%d %H:%M:%S')] Backup process finished successfully"

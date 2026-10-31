#!/usr/bin/env bash
# Restore a KopiPass backup into the database in DATABASE_URL (which should be EMPTY) and STORAGE_DIR.
#   DATABASE_URL=... STORAGE_DIR=./storage scripts/restore.sh backups/daily/kopipass-db-<stamp>.dump [backups/daily/kopipass-storage-<stamp>.tar.gz]
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
DUMP="${1:?path to .dump}"
ARCHIVE="${2:-}"
DB_URL="${DATABASE_URL%%\?*}"
pg_restore --no-owner --exit-on-error --dbname "$DB_URL" "$DUMP"
if [ -n "$ARCHIVE" ]; then mkdir -p "${STORAGE_DIR:-./storage}" && tar -xzf "$ARCHIVE" -C "${STORAGE_DIR:-./storage}"; fi
echo "restore complete"

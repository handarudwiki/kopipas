#!/usr/bin/env bash
# KopiPass backup (M7): PostgreSQL custom-format dump + file storage archive.
# Retention: daily backups 30 days; backups taken on the 1st of the month kept 60 months
# (supports the 5-year data/evidence-pack retention requirement, N8).
#
#   DATABASE_URL=... STORAGE_DIR=./storage BACKUP_DIR=./backups scripts/backup.sh
# Schedule daily via cron, e.g.:  15 2 * * *  cd /srv/kopipass && scripts/backup.sh >> backups/backup.log 2>&1
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
STORAGE_DIR="${STORAGE_DIR:-./storage}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
DB_URL="${DATABASE_URL%%\?*}"   # pg_dump does not accept Prisma's ?schema= parameter
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
KIND="daily"; [ "$(date -u +%d)" = "01" ] && KIND="monthly"
DEST="$BACKUP_DIR/$KIND"
mkdir -p "$DEST"

pg_dump --format=custom --no-owner --file "$DEST/kopipass-db-$STAMP.dump" "$DB_URL"
if [ -d "$STORAGE_DIR" ]; then tar -czf "$DEST/kopipass-storage-$STAMP.tar.gz" -C "$STORAGE_DIR" .; fi
( cd "$DEST" && sha256sum kopipass-*-"$STAMP".* > "kopipass-$STAMP.sha256" 2>/dev/null || shasum -a 256 kopipass-*-"$STAMP".* > "kopipass-$STAMP.sha256" )

find "$BACKUP_DIR/daily" -type f -mtime +30 -delete 2>/dev/null || true
find "$BACKUP_DIR/monthly" -type f -mtime +1830 -delete 2>/dev/null || true
echo "[$(date -u +%FT%TZ)] backup ok: $DEST/*-$STAMP.*"

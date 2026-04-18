#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/thinkai/mongodb}"
MONGO_USER="${MONGO_USER:?Set MONGO_USER}"
MONGO_PASS="${MONGO_PASS:?Set MONGO_PASS}"
S3_BUCKET="${S3_BUCKET:?Set S3_BUCKET}"

mkdir -p "$BACKUP_DIR"
ARCHIVE_PATH="$BACKUP_DIR/thinkai_mongo_$TIMESTAMP.gz"

mongodump \
  --uri="mongodb://$MONGO_USER:$MONGO_PASS@localhost:27017/thinkai?authSource=admin" \
  --archive="$ARCHIVE_PATH" \
  --gzip

aws s3 cp "$ARCHIVE_PATH" "s3://$S3_BUCKET/mongodb/$TIMESTAMP.gz"

find "$BACKUP_DIR" -type f -mtime +7 -delete

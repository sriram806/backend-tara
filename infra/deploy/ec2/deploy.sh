#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/thinkai/services"
IMAGE_TAG="${IMAGE_TAG:-latest}"
GITHUB_REPOSITORY_OWNER="${GITHUB_REPOSITORY_OWNER:-sriram806}"

cd "$APP_DIR"

if [ ! -f .env ]; then
  echo "Missing $APP_DIR/.env"
  exit 1
fi

export IMAGE_TAG
export GITHUB_REPOSITORY_OWNER

aws ecr-public get-login-password >/dev/null 2>&1 || true

docker compose -f infra/docker-compose.prod.yml pull

docker compose -f infra/docker-compose.prod.yml up -d --remove-orphans

docker compose -f infra/docker-compose.prod.yml ps

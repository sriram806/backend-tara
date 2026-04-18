#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/thinkai"
REPO_URL="${REPO_URL:-https://github.com/sriram806/think.git}"

sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg git awscli

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
fi

if ! command -v "docker compose" >/dev/null 2>&1; then
  sudo apt-get install -y docker-compose-plugin
fi

sudo mkdir -p "$APP_DIR"
sudo chown -R "$USER":"$USER" "$APP_DIR"

if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
else
  git -C "$APP_DIR" pull --ff-only
fi

mkdir -p "$APP_DIR/services/infra/deploy/ec2"
if [ ! -f "$APP_DIR/services/.env" ]; then
  cp "$APP_DIR/services/.env.example" "$APP_DIR/services/.env" 2>/dev/null || true
fi

echo "Bootstrap complete. Populate /opt/thinkai/services/.env and run infra/deploy/ec2/deploy.sh"

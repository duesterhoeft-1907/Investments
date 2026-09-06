#!/usr/bin/env bash
#
# Deployment von Hand – für jeden Rechner mit SSH-Zugang zu SiteGround.
# Dasselbe, was der GitHub-Workflow macht, nur lokal ausgelöst.
#
#   SG_HOST=ssh.deinkonto.sg-host.com \
#   SG_USER=u1234-abcdef \
#   SG_PATH=/home/customer/www/deine-domain.de \
#   bin/deploy.sh
#
# Der SSH-Schlüssel wird aus dem Agenten oder ~/.ssh genommen.
set -euo pipefail

HOST="${SG_HOST:?SG_HOST fehlt – z. B. ssh.deinkonto.sg-host.com}"
USER_NAME="${SG_USER:?SG_USER fehlt – der SSH-Benutzer aus den Site Tools}"
TARGET="${SG_PATH:?SG_PATH fehlt – z. B. /home/customer/www/deine-domain.de}"
PORT="${SG_PORT:-18765}"

cd "$(dirname "$0")/.."

echo "→ PHP-Syntax prüfen"
find app bin db public_html -name '*.php' -print0 | xargs -0 -n1 php -l > /dev/null
echo "  in Ordnung"

echo "→ Übertrage nach $USER_NAME@$HOST:$TARGET"
# Konfiguration, Uploads, Sitzungen und Protokolle bleiben unangetastet.
rsync -az --delete --info=stats1 \
  -e "ssh -p $PORT" \
  --exclude '.git' \
  --exclude '.github' \
  --exclude 'app/config.local.php' \
  --exclude 'storage/uploads/***' \
  --exclude 'storage/sessions/***' \
  --exclude 'storage/logs/***' \
  ./ "$USER_NAME@$HOST:$TARGET/"

echo "→ Verzeichnisse und Rechte"
ssh -p "$PORT" "$USER_NAME@$HOST" \
  "mkdir -p '$TARGET'/storage/{uploads,logs,sessions} && chmod -R 775 '$TARGET'/storage"

echo "→ Selbsttest"
ssh -p "$PORT" "$USER_NAME@$HOST" "cd '$TARGET' && php bin/doctor.php"

echo
echo "Fertig. Beim allerersten Mal noch einmal:"
echo "  ssh -p $PORT $USER_NAME@$HOST \"cd '$TARGET' && php db/seed.php\""

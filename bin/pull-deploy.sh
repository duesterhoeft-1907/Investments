#!/usr/bin/env bash
#
# Läuft AUF dem SiteGround-Server. Holt den aktuellen Stand von GitHub,
# setzt die Rechte und prüft die Installation.
#
#   cd ~/www/deine-domain.de && bin/pull-deploy.sh
#
# Anders als bin/deploy.sh (das von aussen hinschiebt) zieht dieses Skript –
# es braucht also keinen SSH-Zugang von irgendwo, nur Netz vom Server zu
# GitHub. Konfiguration und hochgeladene Dateien bleiben unangetastet, weil
# sie in .gitignore stehen und nie im Repository landen.
set -euo pipefail

BRANCH="${DEPLOY_BRANCH:-claude/lead-management-crm-5kniyn}"

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

if [ ! -d .git ]; then
  echo "Fehler: $ROOT ist kein Git-Arbeitsverzeichnis."
  echo "Einmalig einrichten:"
  echo "  git clone -b $BRANCH https://github.com/duesterhoeft-1907/Investments.git ."
  exit 1
fi

echo "→ Aktueller Stand"
git -C "$ROOT" rev-parse --short HEAD

echo "→ Hole von GitHub ($BRANCH)"
git -C "$ROOT" fetch --quiet origin "$BRANCH"

# --ff-only: nur vorspulen, niemals lokale Aenderungen wegmergen.
# Wurde auf dem Server etwas von Hand geaendert, bricht es hier bewusst ab.
if ! git -C "$ROOT" merge --ff-only "origin/$BRANCH"; then
  echo
  echo "Abbruch: Auf dem Server liegen eigene Aenderungen, die nicht"
  echo "einfach vorgespult werden koennen. Erst pruefen:"
  echo "  git -C '$ROOT' status"
  echo "  git -C '$ROOT' diff"
  exit 1
fi

echo "→ Neuer Stand"
git -C "$ROOT" rev-parse --short HEAD

echo "→ Verzeichnisse und Rechte"
mkdir -p storage/uploads storage/logs storage/sessions
chmod -R 775 storage

if [ ! -f app/config.local.php ]; then
  echo
  echo "Hinweis: app/config.local.php fehlt noch."
  echo "  cp app/config.local.example.php app/config.local.php"
  echo "  nano app/config.local.php     # Datenbank und base_url eintragen"
  echo
fi

echo "→ Selbsttest"
php bin/doctor.php

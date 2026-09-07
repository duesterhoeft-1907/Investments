#!/usr/bin/env bash
#
# Läuft AUF dem SiteGround-Server. Holt den aktuellen Stand von GitHub,
# setzt die Rechte und prüft die Installation.
#
#   cd ~/www/deine-domain.de && bin/pull-deploy.sh
#   cd ~/www/deine-domain.de && bin/pull-deploy.sh --quiet   (fuer den Cron)
#
# --quiet schweigt, solange sich nichts geaendert hat und nichts schiefgeht.
# Nur so taugt es fuer den Cron: sonst kaeme alle paar Minuten eine Mail, und
# nach der dritten liest sie niemand mehr – auch die nicht, die zaehlt.
#
# Anders als bin/deploy.sh (das von aussen hinschiebt) zieht dieses Skript –
# es braucht also keinen SSH-Zugang von irgendwo, nur Netz vom Server zu
# GitHub. Konfiguration und hochgeladene Dateien bleiben unangetastet, weil
# sie in .gitignore stehen und nie im Repository landen.
set -euo pipefail

BRANCH="${DEPLOY_BRANCH:-claude/lead-management-crm-5kniyn}"
QUIET=0
[ "${1:-}" = "--quiet" ] && QUIET=1

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

# Im leisen Betrieb sammeln wir die Ausgabe und geben sie nur aus, wenn es
# etwas zu sagen gibt. Bei einem Abbruch (set -e) uebernimmt das die Falle.
LOG="$(mktemp)"
trap 'status=$?; if [ "$status" -ne 0 ] && [ "$QUIET" -eq 1 ]; then
        echo "Ausrollen fehlgeschlagen ($ROOT):"; cat "$LOG"
      fi; rm -f "$LOG"' EXIT

say() { if [ "$QUIET" -eq 1 ]; then echo "$@" >> "$LOG"; else echo "$@"; fi; }
run() { if [ "$QUIET" -eq 1 ]; then "$@" >> "$LOG" 2>&1; else "$@"; fi; }

if [ ! -d .git ]; then
  echo "Fehler: $ROOT ist kein Git-Arbeitsverzeichnis."
  echo "Einmalig einrichten:"
  echo "  git clone -b $BRANCH https://github.com/duesterhoeft-1907/Investments.git ."
  exit 1
fi

BEFORE="$(git -C "$ROOT" rev-parse HEAD)"
say "→ Aktueller Stand: $(git -C "$ROOT" rev-parse --short HEAD)"

say "→ Hole von GitHub ($BRANCH)"
git -C "$ROOT" fetch --quiet origin "$BRANCH"

# Nichts Neues? Dann ist im Cron auch nichts zu tun.
if [ "$BEFORE" = "$(git -C "$ROOT" rev-parse "origin/$BRANCH")" ]; then
  say "→ Schon aktuell."
  [ "$QUIET" -eq 1 ] && exit 0
fi

# --ff-only: nur vorspulen, niemals lokale Aenderungen wegmergen.
# Wurde auf dem Server etwas von Hand geaendert, bricht es hier bewusst ab.
if ! run git -C "$ROOT" merge --ff-only "origin/$BRANCH"; then
  echo
  echo "Abbruch: Auf dem Server liegen eigene Aenderungen, die nicht"
  echo "einfach vorgespult werden koennen. Erst pruefen:"
  echo "  git -C '$ROOT' status"
  echo "  git -C '$ROOT' diff"
  exit 1
fi

say "→ Neuer Stand: $(git -C "$ROOT" rev-parse --short HEAD)"

say "→ Verzeichnisse und Rechte"
mkdir -p storage/uploads storage/logs storage/sessions
chmod -R 775 storage

if [ ! -f app/config.local.php ]; then
  echo
  echo "Hinweis: app/config.local.php fehlt noch."
  echo "  cp app/config.local.example.php app/config.local.php"
  echo "  nano app/config.local.php     # Datenbank und base_url eintragen"
  echo
fi

# Neue Spalten erreichen eine bestehende Datenbank nur hierueber – schema.sql
# legt ausschliesslich an, was noch gar nicht existiert.
if [ -f app/config.local.php ]; then
  say "→ Datenbank nachziehen"
  run php db/migrate.php
fi

say "→ Selbsttest"
run php bin/doctor.php

# Im Cron zaehlt nur, dass es geklappt hat – mit der Fassung, die man
# spaeter im Postfach noch versteht.
if [ "$QUIET" -eq 1 ]; then
  echo "Ausgerollt: $(git -C "$ROOT" rev-parse --short HEAD) – $(git -C "$ROOT" log -1 --format=%s)"
fi

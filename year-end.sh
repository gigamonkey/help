#!/bin/bash

# Year-end archive and reset (see plans/year-end-reset.md): arm the
# reset-year sentinel, restart the app so boot-prep.sh archives the year's
# database and starts a fresh one, then download and verify the archive.
#
# The archive is created on the volume before anything is deleted and stays
# there until you remove it, so a failure anywhere in this script never
# loses data — worst case you fetch the archive by hand from
# /data/archives/ over fly ssh.

set -euo pipefail

APP=bhs-help
URL="https://$APP.fly.dev"

on_app() {
    fly ssh console --app "$APP" -C "$1"
}

# --- Preflight ---------------------------------------------------------

command -v fly >/dev/null || { echo "fly CLI not found"; exit 1; }
command -v sqlite3 >/dev/null || { echo "sqlite3 CLI not found (needed to verify the archive)"; exit 1; }

echo "Checking app status..."
fly status --app "$APP" >/dev/null

# Double-run guard: the machine stamps archives in UTC, the laptop may not,
# so check both spellings of "today".
for stamp in "$(date +%Y%m%d)" "$(date -u +%Y%m%d)"; do
    if compgen -G "db-backups/help-$stamp*.db" >/dev/null; then
        echo "db-backups already has an archive from today ($stamp) — it looks"
        echo "like the year-end reset already ran. Move it aside to run again."
        exit 1
    fi
done

# Wake the machine (suspend/auto-stop posture) so ssh and restart work.
curl -fsS --max-time 30 "$URL/health" >/dev/null || {
    echo "$URL/health is not responding; not proceeding."
    exit 1
}

echo
echo "This will archive and RESET the $APP database."
echo "All classes, users, and help requests will be gone; the new year"
echo "starts empty. (The archive is kept, and verified, before anything"
echo "is discarded.)"
echo
read -r -p "Type the app name ($APP) to continue: " confirm
if [[ "$confirm" != "$APP" ]]; then
    echo "Aborted."
    exit 1
fi

mkdir -p db-backups

# --- Reset -------------------------------------------------------------

echo "Arming the reset-year sentinel..."
on_app "touch /data/reset-year"

echo "Restarting the app (boot-prep archives and resets during boot)..."
fly apps restart "$APP"

echo "Waiting for the app to come back..."
ok=""
for _ in $(seq 1 60); do
    if curl -fsS --max-time 5 "$URL/health" >/dev/null 2>&1; then
        ok=1
        break
    fi
    sleep 2
done
if [[ -z "$ok" ]]; then
    echo "App did not come back healthy. The reset may or may not have run;"
    echo "check 'make logs'. If it ran, the archive is on the volume in"
    echo "/data/archives/ — nothing has been lost."
    exit 1
fi

# --- Download and verify the archive -----------------------------------

echo "Locating the archive on the volume..."
archive=$(on_app "ls -t /data/archives" | tr -d '\r' | head -1)
if [[ -z "$archive" ]]; then
    echo "No archive found in /data/archives — did the reset run? See 'make logs'."
    exit 1
fi

local_copy="db-backups/$archive"
if [[ -e "$local_copy" ]]; then
    echo "$local_copy already exists locally; refusing to overwrite it."
    echo "Move it aside and re-run, or fetch by hand:"
    echo "  fly ssh sftp get /data/archives/$archive --app $APP"
    exit 1
fi

echo "Downloading $archive..."
fly ssh sftp get "/data/archives/$archive" "$local_copy" --app "$APP"

echo "Verifying the archive..."
integrity=$(sqlite3 "$local_copy" "pragma integrity_check;")
if [[ "$integrity" != "ok" ]]; then
    echo "INTEGRITY CHECK FAILED: $integrity"
    echo "The on-volume copy at /data/archives/$archive is untouched; retry"
    echo "the download before anything else."
    exit 1
fi
echo "Archive row counts (should look like the year that just ended):"
sqlite3 "$local_copy" \
    "select '  users:   ' || count(*) from users;
     select '  classes: ' || count(*) from classes;
     select '  help:    ' || count(*) from help;"

# --- Verify the reset --------------------------------------------------

echo "Verifying production starts fresh..."
users=$(on_app "sqlite3 /data/help.db 'select count(*) from users'" | tr -d '[:space:]')
if [[ "$users" != "0" ]]; then
    echo "WARNING: production database has $users users — that does not look"
    echo "like a fresh year. Investigate before assuming the reset happened"
    echo "(a same-day rerun after a failed reset can leave the old db in"
    echo "place while an older archive exists)."
    exit 1
fi

# --- Done --------------------------------------------------------------

cat <<EOF

Year-end reset complete.

  - Archive: $local_copy (verified). Copy it somewhere durable.
  - The volume still has /data/archives/$archive as a second copy.
    Once the local archive is safely stored, remove it with:
      fly ssh console --app $APP -C "rm /data/archives/$archive"
  - Everyone logs in fresh (accounts are recreated on first Google
    login); teachers re-create their classes from Google Classroom.
  - Consider running the litestream restore drill against the new
    generation (see plans/year-end-reset.md Phase 4).
EOF

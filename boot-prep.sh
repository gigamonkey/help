#!/bin/bash

# Boot-time database preparation, run by run.sh before anything opens the
# database — the one moment the file is free. Standalone (rather than
# inline in run.sh) so test/year-end.test.ts can exercise it without
# starting the server.
#
# Sentinels, both consumed when acted on:
#
#   $DB_DIR/reset-year — year-end archive-and-reset (see
#       plans/year-end-reset.md): snapshot the database with VACUUM INTO,
#       remove it, and arm no-restore so the new year starts empty.
#
#   $DB_DIR/no-restore — when the database is missing, skip the litestream
#       replica restore once (a deliberate fresh start).

set -euo pipefail

if [[ -e "$DB_DIR/reset-year" ]]; then
    # Consume the sentinel first so no step below ever runs twice; any
    # later failure aborts the boot with the old database intact.
    rm "$DB_DIR/reset-year"
    if [[ -f "$DB_DIR/$DB_FILE" ]]; then
        mkdir -p "$DB_DIR/archives"
        archive="$DB_DIR/archives/help-$(date +%Y%m%d).db"
        if [[ -e "$archive" ]]; then
            archive="$DB_DIR/archives/help-$(date +%Y%m%dT%H%M%S).db"
        fi
        sqlite3 "$DB_DIR/$DB_FILE" "VACUUM INTO '$archive'"
        rm -f "$DB_DIR/$DB_FILE" "$DB_DIR/$DB_FILE-wal" "$DB_DIR/$DB_FILE-shm"
        echo "##################################################################"
        echo "## YEAR-END RESET: database archived to"
        echo "##   $archive"
        echo "## Starting the year with a fresh database."
        echo "##################################################################"
    else
        echo "reset-year sentinel found but no database; starting fresh anyway"
    fi
    touch "$DB_DIR/no-restore"
fi

# Without litestream there is nothing to restore. (A no-restore sentinel
# armed above is inert in this mode until litestream is configured.)
if [[ -z "${LITESTREAM_BUCKET_NAME:-}" ]]; then
    exit 0
fi

# Restore the database if it does not already exist.
if [[ -f "$DB_DIR/$DB_FILE" ]]; then
    echo "Database already exists, skipping restore"
else
    if [[ -e "$DB_DIR/no-restore" ]]; then
        echo "No database found but no-restore file indicates no restore wanted"
        # Clean out the litestream stuff.
        rm -rf "$DB_DIR/.$DB_FILE-litestream"
        # Then remove this file so in future we will restore again
        rm "$DB_DIR/no-restore"
    else
        echo "No database found, restoring from replica if exists"
        litestream restore -if-replica-exists -config /etc/litestream.yml "$DB_DIR/$DB_FILE"
    fi
fi

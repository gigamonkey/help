#!/bin/bash

# Adapted from:
# https://github.com/benbjohnson/litestream-docker-example/blob/main/scripts/run.sh
# following the shape of bhs-cs website/run.sh.

set -euo pipefail

# Litestream is optional so a fresh app can be brought up (and its database
# freely reset) before replication is configured. It is opt-in via the
# LITESTREAM_* secrets; with them unset we run the server bare. This must
# never be the steady state once real data exists.
if [[ -z "${LITESTREAM_BUCKET_NAME:-}" ]]; then
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    echo "!!! LITESTREAM NOT CONFIGURED: no replication, no restore.     !!!"
    echo "!!! Database exists only on this volume (+ fly's daily volume  !!!"
    echo "!!! snapshots). Do not run real data this way.                 !!!"
    echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
    exec node index.ts
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

# Run litestream with your app as the subprocess.
exec litestream replicate -exec "node index.ts"

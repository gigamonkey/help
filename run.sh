#!/bin/bash

# Adapted from:
# https://github.com/benbjohnson/litestream-docker-example/blob/main/scripts/run.sh

set -euo pipefail

# Without Litestream config, run bare. Loudly: in production this means no
# replication, so it should only ever happen on purpose.
if [[ -z "${LITESTREAM_BUCKET_NAME:-}" ]]; then
    echo "################################################################"
    echo "## LITESTREAM_BUCKET_NAME is not set.                         ##"
    echo "## Running WITHOUT Litestream: no restore, NO REPLICATION.    ##"
    echo "################################################################"
    exec node index.ts
fi

# Touch $DB_DIR/no-restore for a deliberate fresh start: skips the replica
# restore exactly once (the sentinel is consumed).
if [[ -f "$DB_DIR/no-restore" ]]; then
    echo "no-restore sentinel found: skipping restore and removing sentinel"
    rm "$DB_DIR/no-restore"
elif [[ -f "$DB_DIR/$DB_FILE" ]]; then
    echo "Database already exists, skipping restore"
else
    echo "No database found, restoring from replica if exists"
    litestream restore -if-replica-exists -config /etc/litestream.yml "$DB_DIR/$DB_FILE"
fi

# Run litestream with your app as the subprocess.
exec litestream replicate -exec "node index.ts"

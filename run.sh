#!/bin/bash

# Adapted from:
# https://github.com/benbjohnson/litestream-docker-example/blob/main/scripts/run.sh

set -euo pipefail

# Restore the database if it does not already exist.
if [[ -f "$DB_DIR/$DB_FILE" ]]; then
    echo "Database already exists, skipping restore"
else
    echo "No database found, restoring from replica if exists"
    litestream restore -if-replica-exists -config /etc/litestream.yml /data/db.db
fi

# Run litestream with your app as the subprocess.
exec litestream replicate -exec "node index.js"

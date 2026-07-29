#!/bin/bash

# Adapted from:
# https://github.com/benbjohnson/litestream-docker-example/blob/main/scripts/run.sh
# following the shape of bhs-cs website/run.sh. The sentinel and restore
# logic lives in boot-prep.sh so the tests can run it without starting
# the server.

set -euo pipefail

"$(dirname "${BASH_SOURCE[0]}")/boot-prep.sh"

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

# Run litestream with your app as the subprocess.
exec litestream replicate -exec "node index.ts"

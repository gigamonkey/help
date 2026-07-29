# Year-end database archive and reset

Provide a first-class, once-a-year operation: archive the school year's
database and start the new year with a fresh one.

## The problem

The old ritual — download the db, delete it, restart — no longer works:

1. **Litestream undoes naive deletion.** `run.sh` restores from the
   replica whenever the db file is missing, so deleting `help.db` and
   restarting just resurrects the old data. That's exactly what it's for;
   the reset has to be something Litestream-aware, not a workaround.

2. **The db can't be safely deleted while the app runs.** The server and
   `litestream replicate` both hold it open; yanking the file out from
   under them is undefined-behavior territory.

3. **A two-step archive-then-reset has a write gap.** If the archive is
   taken while the app is live and the reset happens on a later restart,
   any help request filed in between is silently lost.

## What we already have to build on

- `run.sh` already has a one-shot sentinel pattern (`$DB_DIR/no-restore`)
  and runs **before** anything opens the db — boot time is the one moment
  the file is free.
- `schema.sql` is idempotent and runs at every boot, so a fresh database
  materializes on first start with no extra step.
- The image ships a `sqlite3` CLI (kept for exactly this kind of volume
  surgery) and `backup-db` already demonstrates `VACUUM INTO`.
- `make ssh` / `fly ssh sftp` for on-machine commands and file download.

## Decisions (settled up front)

- **The destructive work happens at boot, gated on a sentinel**
  (`$DB_DIR/reset-year`), not against the live db. At boot nothing has
  the db open and there is zero gap between "last write archived" and
  "new year begins" — problems 2 and 3 disappear by construction.

- **One command orchestrates it** (`make year-end`): touch the sentinel,
  restart, wait for health, download the archive, verify it locally. No
  memorized multi-step ritual for a once-a-year task.

- **The yearly archive is a `VACUUM INTO` snapshot, not the Litestream
  replica.** After the reset Litestream starts a new generation for the
  new db and the old generation ages out with retention (default 24h for
  the deployed v0.3.13 — verify during implementation). The archive is
  therefore made *before* the old file is removed, kept in
  `$DB_DIR/archives/` on the volume, and downloaded to the operator's
  machine — three copies before anything is deleted, two after the
  volume copy is eventually pruned.

- **Everything resets, including users.** Users are keyed on Google id
  and re-created on first login (admins re-granted via the
  `@berkeley.net` rule); classes are re-created from Google Classroom.
  Nothing needs to be carried over, and carrying nothing over is what
  makes the reset trivial to reason about.

- **Fail closed.** If any reset step at boot fails (`set -euo pipefail`),
  the machine exits before deleting anything and fly restarts it; worst
  case is a crash loop with the old data intact, never a silent loss.

## Phase 1 — Boot-time reset logic

1. Extract the pre-exec logic of `run.sh` (sentinel handling + restore
   decision) into `boot-prep.sh`, called by `run.sh` before it execs the
   server. Motivation: `run.sh` ends in `exec node index.ts`, so the
   logic can't be tested without starting the server; `boot-prep.sh` can
   be run standalone against a scratch directory.

2. Add `reset-year` handling to `boot-prep.sh`, ordered for crash
   safety (consume the sentinel first so no step ever runs twice; each
   later failure leaves the old db in place):

   ```bash
   if [[ -f "$DB_DIR/reset-year" ]]; then
       rm "$DB_DIR/reset-year"
       mkdir -p "$DB_DIR/archives"
       archive="$DB_DIR/archives/help-$(date +%Y%m%d).db"
       sqlite3 "$DB_DIR/$DB_FILE" "VACUUM INTO '$archive'"
       rm -f "$DB_DIR/$DB_FILE" "$DB_DIR/$DB_FILE-wal" "$DB_DIR/$DB_FILE-shm"
       # loud banner: archived to $archive, starting the year fresh
   fi
   ```

   A reset implies skipping the replica restore (that's the whole
   point), so this path sets the same skip-restore flag the `no-restore`
   sentinel sets. The sentinel logic must work in bare mode too
   (`LITESTREAM_BUCKET_NAME` unset) so it can be exercised locally.

   Edge case: sentinel present but no db file (e.g. someone touched it
   on a fresh volume) — skip the archive step, still skip the restore,
   still start clean.

3. `test/year-end.test.ts` (node:test, shelling out): in a temp dir,
   seed a db through the real layer, touch `reset-year`, run
   `boot-prep.sh` bare, and assert: archive file exists, opens, has the
   seeded rows (`integrity_check` ok); `$DB_FILE` is gone; sentinel is
   gone; running `boot-prep.sh` again is a no-op normal boot. Also cover
   the no-db edge case.

Done when: the test passes and a manual local run of `run.sh` in bare
mode with a sentinel archives, resets, and boots a fresh working app.

## Phase 2 — Orchestration: `make year-end`

1. `year-end.sh` (repo root, wrapped by a `year-end` Makefile target):

   1. Preflight: `fly status` reachable; refuse if a
      `db-backups/help-<today's stamp>.db` already exists (double-run
      guard); require the operator to type the app name (`bhs-help`) to
      confirm — this is the app's most destructive operation.
   2. `fly ssh console -C "touch /data/reset-year"`
   3. `fly apps restart` (single-machine app; suspend/auto-stop posture
      means the restart may need `fly machine start` first — handle
      both).
   4. Poll `/health` until 200.
   5. `fly ssh sftp get /data/archives/help-<stamp>.db
      db-backups/help-<stamp>.db`
   6. Verify the download: `pragma integrity_check`, then print row
      counts (`users`, `help`, `classes`) so the operator can eyeball
      that the archive is the real year, not an empty file.
   7. Verify the reset: on-machine `sqlite3 /data/help.db "select
      count(*) from users"` is 0.
   8. Print the closing checklist: copy the archive somewhere durable;
      `rm /data/archives/...` from the volume once that's done; everyone
      logs in fresh; teachers re-create classes from Classroom.

2. Failure stances: if the download or verification fails, say loudly
   that the archive still exists on the volume at its printed path and
   how to fetch it — never leave the operator guessing whether data
   survived. The reset itself has already happened by then and that's
   fine; the archive is safe on the volume.

Done when: `make year-end` runs end-to-end against a scratch fly app (or
the real one at actual year end) and produces a verified local archive
plus an empty production db.

## Phase 3 — Docs

1. CLAUDE.md deployment section: one short paragraph — year-end reset is
   `make year-end`; archives land in `db-backups/` locally and
   `/data/archives/` on the volume; the `reset-year` sentinel is the
   boot-time mechanism (alongside the existing `no-restore` note).

2. `backup-db` and `template.env` are unaffected; `UPGRADE-2026.md` is a
   historical document and stays untouched.

## Phase 4 — First real run (at year end)

1. Verify the Litestream retention assumption before relying on it:
   confirm the old generation's lifetime in the bucket after a reset,
   and decide whether to set an explicit `retention` in `litestream.yml`
   (probably yes, if only to make the behavior documented rather than
   default).

2. Run `make year-end` for real. Immediately after, do the restore drill
   against the *new* generation (`litestream restore` to a scratch path)
   to confirm replication of the fresh db is healthy — this doubles as
   the annual restore drill the modernization left outstanding.

3. Move the downloaded archive to durable storage and prune the volume
   copy.

## Out of scope (deliberately)

- Any in-app/admin-UI trigger for the reset. It's a once-a-year,
  operator-only action; a web endpoint that can destroy the year's data
  is all downside.
- Carrying selected data (users, classes) across years — see Decisions.
- Automating the calendar ("it's June, resetting now") — the operator
  decides when the year is over.
- A generic multi-archive browser/restore tool; `sqlite3` against the
  downloaded file covers the "what was last year's data?" case.

# Upgrade notes: adopt-bhs-cs-conventions (July 2026)

The modernization plan (`plans/adopt-bhs-cs-conventions.md`) is implemented —
all phases, as one commit (or a few) per phase. `make check` (Biome lint
warning-free + `tsc --noEmit` + 19 `node:test` tests) is the full local gate
and passes. This file is the checklist of what has to happen **outside** the
tree before and after the first deploy of this code.

## Before the first deploy

1. **Rename the env vars in `fly.env`, then re-import** with `make secrets`
   (`fly secrets import --stage`). The old names will no longer boot the app:

   | Old name       | New name               |
   |----------------|------------------------|
   | `SECRET`       | `SESSION_SECRET`       |
   | `CLIENT_ID`    | `GOOGLE_CLIENT_ID`     |
   | `CLIENT_SECRET`| `GOOGLE_CLIENT_SECRET` |
   | `REDIRECT_URL` | `GOOGLE_REDIRECT_URL`  |

   The full variable roster (app + Litestream) is documented in the tracked
   `template.env`. A misconfigured boot fails fast with a message naming the
   missing variables, so a mistake here is loud, not silent.

2. **Deploy with `make deploy`** — it runs `make check` first, then
   `fly deploy`.

3. **Expect a one-time logout for everyone.** The session cookie format
   changed (crypto-js AES cookie → signed cookie-session cookie). Same effect
   as any session-secret rotation; no action needed.

## Soon after

4. **Litestream restore drill** (never yet done, and "replication never
   restored from is a hope, not a backup"): on the machine or locally with
   the Litestream env vars set,

   ```sh
   litestream restore -config /etc/litestream.yml -o /tmp/drill.db "$DB_DIR/$DB_FILE"
   sqlite3 /tmp/drill.db 'select count(*) from users; select count(*) from help;'
   ```

   and sanity-check the counts. (`make ssh` gets you a console; the image
   ships a `sqlite3` CLI.)

5. **Reconcile `main`.** CLAUDE.md now records the decision: `help` is the
   live lineage and this work was built on `update` (from `help`); `main` is
   EC2/pm2-era, ~3 years stale. Either fast-forward/reset `main` to the
   merged result or delete it — until then, nothing should be based on it.

## Not done from the implementation container

These couldn't be verified in the sandboxed environment (no fly CLI or
credentials, no Docker daemon):

- The deploy itself, including a `docker build` of the image. The Dockerfile
  changes are: Node 26-slim base, `npm ci --omit=dev`, `chmod +x run.sh`,
  and `run.sh` now exec'ing `node index.ts`. The build stage keeps its
  build tools, which better-sqlite3 (pulled in by pugsql) may need if no
  prebuilt binary matches.
- The restore drill above.

## Behavior changes worth knowing about

All deliberate, each flagged in its phase's commit message:

- **Resync scoping fix:** de-rostering a student used to delete their
  `class_members` rows in *every* class; it is now scoped to the class being
  resynced.
- **Unknown class is a 404** (`/c/:class_id` with a bad id) instead of a
  crash in a db callback.
- **Student-entered markdown is sanitized** (marked + DOMPurify) — script
  tags and event-handler attributes are stripped. Resolves the old FIXME.
- **fly posture:** `auto_stop_machines = 'suspend'`,
  `min_machines_running = 0` (was `'stop'`/1), plus an HTTP health check on
  `GET /health`. Revert in `fly.toml` if the cold-start latency ever
  matters.
- **Trimmed session tokens:** only `access_token`/`scope`/`token_type` are
  kept in the cookie for the Classroom calls (the id_token risked the 4KB
  cookie limit).

## Known wart discovered during the work

The `help` table's primary key is `(user_id, class_id, created_at)` with
seconds-resolution timestamps, so one user filing twice in the same class
within one second violates the PK. Recorded in TODO.md; fixing it means a
schema migration.

## Day-to-day changes

- `make check` before committing; `make fmt` to format. Biome replaced
  eslint + prettier; the whole-tree reformat commit is in
  `.git-blame-ignore-revs` (`git config blame.ignoreRevsFile
  .git-blame-ignore-revs` to make blame skip it).
- Dev without secrets: `DEV_MODE=true make dev`, log in via `/dev/login`;
  `npm run dev:reset` rebuilds the seeded fixtures world.
- SQL lives in `modules/queries.sql`; the schema stays idempotent and runs
  at every boot. Tests and seeds share `seed/fixtures.ts` — change them
  together.

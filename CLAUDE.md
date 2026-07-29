# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## What this is

A help-queue web app for classes: students request help; teachers and helpers
manage the queue; rosters sync from Google Classroom. Single Express 5 server
(`index.ts`), Nunjucks templates (`views/`), SQLite database (not checked in).
TypeScript throughout, run **directly** on Node 26's type stripping — there is
no build step; `tsc` is typecheck-only. ES modules; relative imports use
explicit `.ts` extensions.

There is no journal/prompt feature here — that lives in the bhs-cs monorepo's
`website/` app.

## Branches

The live app's lineage is the `help` branch; the modernization (this tree)
was built on `update`, branched from `help`. `main` last touched the code in
the EC2/pm2 era, roughly three years behind — **never base work on `main`**
until it has been fast-forwarded to the current trunk.

## Commands

```bash
make setup       # npm install
make dev         # nodemon + node --env-file-if-exists=.env index.ts
make fmt         # biome format --write
make lint        # biome check (warning-free required: --error-on-warnings)
make typecheck   # tsc --noEmit
make test        # node --test test/*.test.ts
make check       # lint + typecheck + test — the full local gate
make deploy      # make check, then fly deploy
make secrets     # push fly.env to fly (set-secrets.sh)
make logs        # fly logs
make ssh         # fly ssh console

npm run dev:reset    # wipe the dev db and reseed the fixtures world
node make-secret.ts  # generate a SESSION_SECRET value
```

**Dev with zero secrets:** set `DEV_MODE=true` (e.g. in `.env`; see the
tracked `template.env` for every variable). DEV_MODE replaces Google OAuth
with a `/dev/login` page that lists the seeded users to become. Never set it
in production.

## Architecture

**Config** (`modules/config.ts`): the only place `process.env` is read —
typed, defaulted constants, fail-fast on missing required vars. Env var
names: `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_REDIRECT_URL`, `DB_DIR`, `DB_FILE`, `PORT`, `DEV_MODE`.

**Database** (`modules/db.ts`): one long-lived synchronous better-sqlite3
connection via [pugsql]. All SQL lives as named queries in
`modules/queries.sql` (`-- :name query :kind` blocks, `:param`
placeholders); pugsql attaches each as a method on `db`, so handlers call
`db.queue({ class_id })` etc. — no callbacks anywhere. Multi-statement
operations (`createClass`, `resyncClass`, `ensureUser`) are plain functions
in `db.ts` wrapped in `db.transaction()`. `modules/schema.sql` is idempotent
and runs at every boot, so a fresh database materializes on first start.

**Routes**: one module per permission regime, mounted from `index.ts`
(which is just middleware order + mounts + listen):

- `modules/routes-public.ts` — `/health`, `/logout`, `/auth`
- `modules/routes-user.ts` — logged-in pages; `/users/:id` stays
  self-or-admin in-handler
- `modules/routes-helper.ts` — help state changes; `help/:id/done` keeps its
  in-handler helper-or-requester check
- `modules/routes-teacher.ts` — students/members, `guardedRouter(teacherOnly)`
- `modules/routes-admin.ts` — `/classes` Classroom integration,
  `guardedRouter(adminOnly)`
- `modules/routes-dev.ts` — `/dev/login`, mounted only in DEV_MODE

**Permissions** (`modules/permissions.ts`): guards are plain Express
middleware; `guardedRouter(guard)` returns a Router that injects the guard
per-route. Per-class roles (`teacher`, `helper`, `student`) come from
`class_members`; `users.is_admin` is global and granted on first login to
`@berkeley.net` addresses (`ensureUser`). `modules/class-context.ts` loads
the class name and the current user's role into `res.locals` for
`/c/:class_id` pages and 404s unknown classes.

**Auth** (`modules/require-login.ts`, `modules/oauth.ts`): hand-rolled
Google OAuth. The entire session — user, trimmed Google tokens, and the
OAuth state nonce — lives in a signed `cookie-session` cookie; there is no
session table. A cookie whose user is missing from the db (post-reset) is
treated as logged out.

**Dates** (`modules/dateformat.ts`): Temporal over `America/Los_Angeles`
(via `@js-temporal/polyfill` until Node's native Temporal is unflagged).
Nunjucks filters live in `modules/datefilter.ts` and `modules/mdfilter.ts`
(marked + DOMPurify — student text is sanitized in one place).

**Domain model**: a help request is "open" while `closed_at` is null and
"done" once set. Timestamps are seconds-resolution unix epoch from SQLite
(`unixepoch('now')`).

## Tests and seeds

`node:test` + `node:assert`, no framework, in `test/*.test.ts`:

- `queries.test.ts` — constructing the DB against a `:memory:` schema proves
  every named query prepares.
- `permissions.test.ts` — spawns the real server in DEV_MODE on a throwaway
  seeded db and asserts the URL × persona status matrix (anonymous, student,
  helper, teacher, student-from-another-class, admin) with a cookie-jar
  fetch helper.
- `dates.test.ts` — Temporal formatting across DST boundaries.

`seed/fixtures.ts` is the deterministic dev world (`npm run dev:reset`
loads it); the permissions matrix depends on its exact ids, so change it
and the tests together.

## Deployment

fly.io app `bhs-help` (sjc), Dockerfile-based, SQLite on the `data` volume
at `/data`, Litestream replicating to S3/Tigris. `run.sh` restores from the
replica when the db is missing (touch `$DB_DIR/no-restore` on the volume to
deliberately skip that once), then runs the server under
`litestream replicate`; without `LITESTREAM_BUCKET_NAME` it runs bare and
says so loudly. `fly.toml` health-checks `GET /health`. Secrets go in the
untracked `fly.env`, pushed with `make secrets`; `template.env` documents
every variable. `backup-db` (VACUUM INTO) is an ad-hoc secondary to
Litestream, usable over `make ssh`. `.dockerignore` is whitelist-style —
keep it that way when adding files the image needs.

## Style

Biome for formatting and linting (config in `biome.json`): 2-space indent,
100 columns, single quotes; `make lint` must be warning-free. `snake_case`
names coming from SQL columns and URL params (`class_id`) are used as-is.
The whole-tree Biome reformat commit is listed in `.git-blame-ignore-revs`
(`git config blame.ignoreRevsFile .git-blame-ignore-revs`).

[pugsql]: https://www.npmjs.com/package/pugsql

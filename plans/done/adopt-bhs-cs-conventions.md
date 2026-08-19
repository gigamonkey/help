# Adopt bhs-cs coding and deployment conventions

Modernize this app to follow the coding and deployment style of the two apps
in the bhs-cs monorepo (`website/` and `lesson-planning/`), while staying a
standalone repo.

## Branch situation (read first)

**The live app is the `help` branch, not `main`.** `main` (and the `refresh`
branch this plan was written on) last touched the code in the EC2/pm2 era;
`help` has ~3 years of further work, including the fly.io + Litestream
migration ("Fly setup", "Add litestream" commits), the Express 5 upgrade,
and re-keying users on Google id instead of email.

**Resolved (2026-07-28):** this plan now lives on the `update` branch,
created from `help` with the `refresh` plan commits cherry-picked onto it —
the "bring this work onto the help code" step is done. Still outstanding:

1. Fast-forward/merge `main` so it stops being a trap (or decide `help` is
   simply the trunk and say so in CLAUDE.md).

2. Regenerate CLAUDE.md, which still describes the stale tree
   (EC2/pm2/bounce, hardcoded admins, email-keyed users — and a journal
   feature this branch no longer has).

**The journal feature no longer exists here.** `help`'s history removes
journals entirely ("Removing journal from everything but the database
schema", "Excise journal from schema and storage.js"); the journal now
lives in the bhs-cs monorepo's `website/` app. (The `journal` branch in
this repo — the mirror-image split that removed the help queue instead —
is a historical artifact.) This app is the help queue only — no prompts,
no journal entries, anywhere in code, schema, or views.

## What the help branch already has (no work needed)

- fly.io app `bhs-help` (sjc, `data` volume at `/data`, port 3000) deployed
  from a Dockerfile; `set-secrets.sh` pushes `fly.env` via
  `fly secrets import`.

- Litestream: `litestream.yml` (env-interpolated, S3/Tigris — essentially
  identical to bhs-cs website's) and `run.sh` (restore-if-missing, then
  `litestream replicate -exec "node index.js"`), plus the litestream-tips
  pragmas at the top of `schema.sql`.

- Express 5, morgan logging, `DB_DIR`/`DB_FILE` from env.

- Users keyed by Google id (`users.id`), `pronouns` column, no hardcoded
  `ADMINS`/`OTHER_NAMES` maps; stale-cookie handling when the db has been
  reset.

- `db-patches/` and `load-class.js` already deleted.

## Decisions (settled up front)

- **Standalone repo.** Adopt the conventions with local copies of the shared
  config (biome.json, tsconfig, Makefile shape). Not folded into the bhs-cs
  monorepo. Consequence: the private `@peterseibel/bhs-config` secrets CLI
  isn't available; the existing `fly.env` + `set-secrets.sh` arrangement
  stays, documented by a tracked `template.env`.

- **Auth stays hand-rolled Google OAuth** (the lesson-planning style), with
  `cookie-session` signed cookies replacing the crypto-js AES cookie. Not
  Passport. The OAuth state nonce moves into the session cookie, which
  eliminates the `sessions` table entirely.

- **Single long-lived db connection** (the website style: one `modules/db.ts`
  exporting the connection), not lesson-planning's open-per-request. That
  pattern exists there only because of its per-editor cache dbs; this app,
  like website, has one db.

## Target state at a glance (relative to `help`)

| Now (help branch) | Target |
|---|---|
| Plain JS, ES modules | TypeScript run directly on Node 26 type stripping (no build step) |
| eslint 9 installed but airbnb-era `.eslintrc.json` + prettier | Biome (format + lint, warning-free, `--error-on-warnings`) |
| `sqlite3` with `(err, data)` callbacks | `better-sqlite3` via pugsql, fully synchronous |
| SQL inline in `modules/storage.js` | Named queries in `modules/queries.sql` (`-- :name x :get`) |
| AES-encrypted session cookie (crypto-js) | `cookie-session` signed cookie |
| `sessions` table for OAuth state | Nonce in the session cookie; table dropped |
| Hardcoded DST boundaries (dateformat.js) | Temporal with `America/Los_Angeles` (polyfill already a dep) |
| No tests | `node:test` suite incl. a permissions matrix |
| Node 24 base image, `npm ci` of everything (pm2, nodemon ship) | Node 26, `npm ci --omit=dev`, dev tools in devDependencies |
| EC2-era leftovers in tree (`bounce`, `connect`, `upload`, `download`, `ec2-setup.txt`, pm2 Makefile targets) | Deleted |
| `.env` via dotenv | `node --env-file` in dev; fly secrets + `[env]` in prod |

Reference files to crib from (in `/Users/peter/hacks/bhs-cs`):
`tsconfig.base.json`, `biome.json`, `website/modules/db.ts`,
`website/modules/permissions.ts` (`guardedRouter`), `website/run.sh` (the
optional-litestream banner + `no-restore` sentinel), `website/fly.toml`
(the `[[http_service.checks]]` block), `lesson-planning/routes_collab.ts`
(OAuth flow), `lesson-planning/test/` and `website/test/permissions.test.ts`
(test style).

Each phase should land as its own commit(s) with the app still working —
and, since the app is live, each phase is deployable with `fly deploy`
whenever confidence warrants.

## Phase 0 — Branch reconciliation and dead-file sweep

1. ~~Rebase this work onto `help`~~ — done; this is the `update` branch
   (see "Branch situation" above).

2. Delete the EC2-era leftovers: `bounce`, `connect`, `upload`, `download`,
   `ec2-setup.txt`, `backup-db` (superseded below), the pm2
   `start`/`restart`/`stop` Makefile targets, and the `pm2` dependency.
   Anything worth remembering from `ec2-setup.txt` is already moot.

3. Reconcile the lint-config confusion: eslint 9 is installed but the
   config is still airbnb-era `.eslintrc.json` (eslint 9 doesn't read it).
   Don't fix it — Phase 1 replaces the whole arrangement with Biome; just
   note it so nobody burns time on it.

Done when: `git grep -i 'ec2\|pm2'` finds nothing but history.

## Phase 1 — Tooling baseline

1. Add `mise.toml` pinning `node = "26"`, and bump the Dockerfile's
   `NODE_VERSION` to match (26-slim, from 24.1.0).

2. Replace eslint + prettier with Biome: `biome.json` copied from the
   bhs-cs root config minus the monorepo-specific `files.includes`
   exclusions and `overrides` (start with zero overrides; add per-file ones
   only if needed). Key settings: 2-space indent, `lineWidth: 100`, single
   quotes, `quoteProperties: 'preserve'`, linter preset `recommended`,
   `organizeImports: on`, `vcs.useIgnoreFile: true`.

3. npm scripts using the standard names every bhs-cs workspace uses:

   - `lint`: `biome check . --max-diagnostics=none --error-on-warnings`

   - `fmt`: `biome format --write .`

   - `typecheck`: `tsc --noEmit` (activates in Phase 2)

   - `test`: `node --test 'test/*.test.ts'` (activates in Phase 6)

4. Rework the Makefile: keep `SHELL := bash -O globstar`, add `.SUFFIXES:`;
   `check` = lint + typecheck + test; retire `pretty`/`ready`/
   `strict_lint`/`quick_lint`/`tidy` in favor of `fmt`/`check`; add
   `deploy` (runs `make check` first, then `fly deploy`), `secrets`
   (wraps `set-secrets.sh`), `logs`, `ssh`.

5. Move `nodemon` (and any other dev-only packages) to devDependencies and
   change the Dockerfile's `npm ci` to `--omit=dev`.

6. Run the reformat, commit it alone, and record the commit hash in a new
   `.git-blame-ignore-revs` (with a comment), so `git blame` skips it.

7. Drop eslint/prettier config files and dependencies.

Done when: `make check` passes warning-free with Biome only.

## Phase 2 — TypeScript

No build step: the server runs `.ts` directly on Node 26's native type
stripping. `tsc` is typecheck-only.

1. `tsconfig.json` copied from bhs-cs `tsconfig.base.json` (strict,
   `noEmit`, `module`/`moduleResolution: nodenext`,
   `allowImportingTsExtensions`, `erasableSyntaxOnly`,
   `verbatimModuleSyntax`, `resolveJsonModule`, `target: es2024`) plus an
   `include` of `*.ts`, `modules/**/*.ts`, `test/**/*.ts`,
   `types/**/*.d.ts`. Public browser JS (`public/js/*.js`) stays plain JS
   for now (see Out of scope).

2. Rename modules `.js` → `.ts` incrementally (they can coexist — Node
   runs both). All relative imports gain explicit `.ts` extensions;
   type-only imports use `import type` (verbatimModuleSyntax). No enums,
   no class parameter properties (erasableSyntaxOnly).

3. Add `types/` for hand-written declarations, following website:
   `types/pugsql.d.ts` (Phase 3) and `types/express-augmentations.d.ts`
   typing `Express.Locals` (`className`, `user`, role) and the session
   shape.

4. New `modules/config.ts` (website convention): read `process.env`
   exactly once into typed, defaulted, fail-fast-validated constants
   (`PORT`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URL`,
   `DB_DIR ?? '.'`, `DB_FILE ?? 'help.db'`, `DEV_MODE`). Everything
   imports from there; nothing else touches `process.env`. A missing
   required var kills the boot with an actionable message. (Env var
   renames like `SECRET` → `SESSION_SECRET`, `CLIENT_ID` →
   `GOOGLE_CLIENT_ID` need matching updates to `fly.env`/secrets before
   the deploy that includes them.)

5. Convert leaf modules first (`permissions`, `crypto`, `oauth`,
   `require-login`), then `index.js` last. `storage.js` is not
   converted — it's replaced wholesale in Phase 3. (`dateformat.js` is
   replaced in Phase 5½; there is no `journal` module on this branch.)

6. Drop `dotenv`; dev runs use `node --env-file=.env` (wired into the
   `dev` script/Makefile target).

Done when: `npm run typecheck` is clean and the app runs via
`node index.ts`.

## Phase 3 — Database layer: better-sqlite3 + pugsql

Replace `modules/storage.js` (sqlite3, callbacks) with the website-style
synchronous layer. This is the heart of the modernization: with sync
queries, the callback plumbing in every route handler (`dbRender`,
`dbRedirect`, `jsonSender`, nested callbacks) collapses into straight-line
code.

1. `modules/queries.sql`: one named query per pugsql block, kinds
   `:get`/`:all`/`:run`/`:insert`/`:exists` as appropriate, `:param`
   placeholders, doc comments, grouped with banner comments by area
   (classes/help/users). Mostly a 1:1 transcription of the
   SQL already in `storage.js` (which is keyed on `user_id` throughout),
   e.g.:

   ```sql
   -- :name queue :all
   -- All open help requests for a class, oldest first.
   select help.rowid as id, help.*, users.name
   from help join users on help.user_id = users.id
   where class_id = :class_id and closed_at is null
   order by created_at asc;
   ```

2. `modules/db.ts` (the only place a connection opens):

   ```ts
   const db = new DB(DB_PATH, 'schema.sql').addQueries(...);
   export default db;
   ```

   `schema.sql` stays idempotent and runs at every boot, exactly as now,
   litestream pragmas and all (pugsql's constructor enables WAL — verify
   it doesn't fight the existing pragma block).

3. Multi-statement operations (`createClass`, `resyncClass`, `ensureUser`)
   become plain TS functions using `db.transaction(() => ...)` — either in
   `db.ts` or a small `modules/logic.ts` if `db.ts` gets crowded.

4. `types/pugsql.d.ts` copied from website (the one sanctioned `any`, with
   its `biome-ignore` comment).

5. Retire: `modules/storage.js`, the `sqlite3` + `sqlite` dependencies,
   and `db.js` (a fresh db now materializes on first boot). The `sessions`
   table queries die in Phase 5; drop the table from `schema.sql` then.

6. Convert `index.js` route handlers area by area (help, classes, users)
   from callbacks to sync calls as their queries land.

7. Add a `test/queries.test.ts` (the lesson-planning trick): constructing
   the DB against a `:memory:` copy of the schema *is* the assertion that
   every named query prepares.

Done when: no callback-style db code remains; `sqlite3` is uninstalled.

## Phase 4 — Server structure and permissions

1. `index.ts` stays the composition root (small app — no `core.ts` split),
   but routes move into permission-regime routers, the website convention:

   - `modules/routes-public.ts` — `/health`, `/logout`, `/auth`

   - `modules/routes-user.ts` — logged-in pages (index, class page, help
     request/queue/done views, `/users/:id` profile — which stays guarded
     in-handler as self-or-admin, as today)

   - `modules/routes-helper.ts` — help-item state changes (`helperOnly` —
     except `help/:id/done`, which today allows the helper *or the
     requester themselves*; that stays an in-handler check)

   - `modules/routes-teacher.ts` — students, members (`teacherOnly`)

   - `modules/routes-admin.ts` — `/classes` Google Classroom integration
     (`adminOnly`)

2. Rewrite `modules/permissions.ts` around website's `guardedRouter(...)`
   pattern: guards injected per-route on a router, one router per regime,
   instead of the current wrap-each-handler `teacherOnly(handler)` scheme.
   The mixed-permission cases above stay in-handler. `ifTeacher`
   (`index.js:60`) is defined but never used on this branch — delete it.

3. The `/c/:class_id` middleware keeps loading class name + role into
   `res.locals` (now typed, and without the fire-after-`next()` race the
   current version has — the role lookup is sync now).

4. Nunjucks filters: replace `nunjucks-date-filter` and
   `nunjucks-markdown-filter` with local filter modules exposing
   `install(env)` (website convention) — a `datefilter` on Temporal
   (Phase 5½) and an `mdfilter` on `marked`. Resolves the standing FIXME
   about DOMPurify (the dep is already installed) by sanitizing markdown
   output in one place.

Done when: every route lives in a regime router; `index.ts` is just
middleware order + mounts + listen.

## Phase 5 — Auth and sessions

Keep the hand-rolled Google OAuth dance, restructured along
`lesson-planning/routes_collab.ts` lines:

1. `cookie-session` (signed, `sameSite: 'lax'`, `httpOnly`) replaces the
   crypto-js AES cookie and `cookie-parser`. `SESSION_SECRET` from config,
   fail-fast (no silent default in prod; DEV_MODE may supply one). Note:
   rolling this out logs everyone in production out once — harmless, same
   as the existing "force re-login if session secret changes" behavior.

2. Login flow: unauthenticated request → store `{ nonce, returnTo }` in
   the session → redirect to Google (`modules/oauth.ts` largely survives).
   `/auth` callback validates `state === nonce` from the cookie session —
   no db round-trip — then exchanges the code, `ensureUser`s, and writes
   `{ user, tokens }` into the session. Drop the `sessions` table, its
   queries, and `newSession`/`getSession`/`deleteSession`.

3. Preserve the help branch's stale-cookie behavior: a valid session whose
   user no longer exists in the db (post-reset) is treated as logged out
   and re-created via the OAuth flow.

4. Google Classroom tokens stay in the session (as today) for the
   admin-only course-create/resync flows. Watch the ~4KB cookie limit; if
   tokens push past it, store only the access token + expiry.

5. `modules/crypto.ts` shrinks to `randomString` (or disappears in favor
   of `crypto.randomBytes(...).toString('base64url')`); crypto-js is
   uninstalled. The unused TOTP code goes.

6. DEV_MODE (website convention, explicit env var, never derived from
   NODE_ENV): registers no real OAuth, mounts a `/dev/login` router
   listing seeded users to become. Loud startup banner; never set in
   `fly.env`. This is what makes the Phase 6 tests runnable without
   secrets.

Done when: login works against real Google; `crypto-js`, `cookie-parser`,
and the `sessions` table are gone; DEV_MODE login works with no `.env`
secrets.

### Phase 5½ — Dates (small, independent)

Replace `modules/dateformat.js` (hardcoded DST boundaries needing yearly
updates — a standing TODO) with Temporal over `America/Los_Angeles` for
`yyyymmdd`, `hhmm`, and `humandate`. `@js-temporal/polyfill` is already a
dependency; keep the polyfill until Node's native Temporal is unflagged.
Delete the DST item from TODO.md. Add a test across a DST boundary in
Phase 6.

## Phase 6 — Seed data and tests

`node:test` + `node:assert`, no framework, tests in `test/*.test.ts`.

1. `seed/fixtures.ts` + `seed/seed-dev.ts` (website convention): a
   deterministic dev world — a class or two, teacher/helper/student users,
   open + closed help requests — loaded through the real db layer.
   `npm run dev:reset` = wipe db + reseed.

2. `test/queries.test.ts` — every named query prepares (from Phase 3).

3. `test/permissions.test.ts` — the website-style matrix: spawn the real
   server in DEV_MODE on a throwaway seeded db, log in as each persona
   (anonymous, student, helper, teacher, student-from-another-class,
   admin) via `/dev/login` with a cookie-jar `fetch` helper, and assert
   the URL × persona status matrix over the interesting routes (queue,
   help state changes incl. done-by-requester vs. done-by-stranger,
   students, members, own vs. others' `/users/:id`, /classes).

4. Targeted unit tests where logic is pure: the Temporal date functions
   (across a DST boundary).

5. Wire `npm test` into `make check`; `make deploy` runs `make check`
   first.

Done when: `make check` (lint + typecheck + test) is the full local gate
and passes.

## Phase 7 — Deployment polish (already on fly + Litestream)

The deployment is live and healthy; this phase just closes the gaps
against the bhs-cs conventions:

1. Dockerfile: Node 26 base (done in Phase 1 with the mise pin),
   `npm ci --omit=dev`, `CMD` runs `node index.ts`. Check whether the
   sqlite3-CLI-from-source build stage is still wanted (bhs-cs website
   kept it; it's for ad-hoc volume surgery over `fly ssh console`).

2. `run.sh`: adopt website's two refinements — the loud banner +
   bare-`node` fallback when `LITESTREAM_BUCKET_NAME` is unset, and the
   `$DB_DIR/no-restore` sentinel for a deliberate fresh start.

3. `fly.toml`: add the `[[http_service.checks]]` block hitting the
   existing `GET /health` (website's: 30s interval, 5s timeout, 10s
   grace). Consider `auto_stop_machines = 'suspend'` +
   `min_machines_running = 0` (the lesson-planning posture — this app has
   no background work; current setting is `'stop'`/1).

4. `.dockerignore`: convert to the whitelist style (`*` then re-include
   what ships) so `.env`/`fly.env`/`*.db` leaks are structurally
   impossible.

5. Add a tracked `template.env` documenting every variable (the bhs-cs
   convention `fly.env` currently lacks); keep `set-secrets.sh` (wrapped
   by `make secrets`).

6. Replace the old `backup-db` (a local `cp`) with a `VACUUM INTO`-style
   script usable over `fly ssh console`, as a secondary to litestream.

7. If it's never been done: a litestream **restore drill** (restore to a
   scratch path, open, check a table). "Replication never restored from
   is a hope, not a backup."

Done when: a `make deploy` from the modernized tree serves production.

## Phase 8 — Docs

1. Regenerate CLAUDE.md against the modernized tree (commands,
   architecture, deploy — no EC2, no pm2, no callbacks).

2. Prune TODO.md items this plan resolves (DST fix; anything else that
   fell out).

3. Note the trunk-branch decision from Phase 0 wherever it landed.

## Out of scope (deliberately)

- Feature work from TODO.md (websockets queue, user management pages,
  avatars, multi-class queues, …) — this plan only modernizes what exists.

- Converting `public/js/*.js` (tiny browser scripts) to a bundled
  client-TS setup — not worth an esbuild pipeline yet. Biome covers them
  as plain JS.

- Nunjucks template rework beyond what the filter changes force.

# Adopt bhs-cs coding and deployment conventions

Modernize this app to follow the coding and deployment style of the two apps
in the bhs-cs monorepo (`website/` and `lesson-planning/`), while staying a
standalone repo.

## Decisions (settled up front)

- **Standalone repo.** Adopt the conventions with local copies of the shared
  config (biome.json, tsconfig, Makefile shape). Not folded into the bhs-cs
  monorepo. Consequence: the private `@peterseibel/bhs-config` secrets CLI
  isn't available, so secrets management is a simplified copy of the pattern
  (see Phase 8).

- **Deploy to fly.io with Litestream**, replacing the EC2 box, pm2, and the
  `bounce`/`connect`/`upload`/`download` scripts.

- **Auth stays hand-rolled Google OAuth** (the lesson-planning style), with
  `cookie-session` signed cookies replacing the crypto-js AES cookie. Not
  Passport. The OAuth state nonce moves into the session cookie, which
  eliminates the `sessions` table entirely.

- **Single long-lived db connection** (the website style: one `modules/db.ts`
  exporting the connection), not lesson-planning's open-per-request. That
  pattern exists there only because of its per-editor cache dbs; this app,
  like website, has one db.

## Target state at a glance

| Now | Target |
|---|---|
| Plain JS, ES modules | TypeScript run directly on Node 26 type stripping (no build step) |
| eslint (airbnb) + prettier | Biome (format + lint, warning-free, `--error-on-warnings`) |
| `sqlite3` with `(err, data)` callbacks | `better-sqlite3` via pugsql, fully synchronous |
| SQL inline in `modules/storage.js` | Named queries in `modules/queries.sql` (`-- :name x :get`) |
| AES-encrypted session cookie (crypto-js) | `cookie-session` signed cookie |
| `sessions` table for OAuth state | Nonce in the session cookie; table dropped |
| Hardcoded `ADMINS` map in storage.js | `ADMIN_EMAILS` env var |
| Hardcoded DST boundaries (dateformat.js) | Temporal with `America/Los_Angeles` |
| No tests | `node:test` suite incl. a permissions matrix |
| EC2 + pm2 + `bounce` | fly.io: Docker + volume + `run.sh` + Litestream |
| `.env` via dotenv | `node --env-file` in dev; fly secrets + `[env]` in prod |

Reference files to crib from (in `/Users/peter/hacks/bhs-cs`):
`tsconfig.base.json`, `biome.json`, `website/modules/db.ts`,
`website/modules/permissions.ts` (`guardedRouter`), `website/run.sh`,
`website/litestream.yml`, `website/fly.toml`, `website/Dockerfile`,
`lesson-planning/routes_collab.ts` (OAuth flow), `lesson-planning/test/`
and `website/test/permissions.test.ts` (test style).

Each phase should land as its own commit(s) with the app still working.

## Phase 1 — Tooling baseline

1. Add `mise.toml` pinning `node = "26"`.

2. Replace eslint + prettier with Biome: `biome.json` copied from the bhs-cs
   root config minus the monorepo-specific `files.includes` exclusions and
   `overrides` (start with zero overrides; add per-file ones only if needed).
   Key settings: 2-space indent, `lineWidth: 100`, single quotes,
   `quoteProperties: 'preserve'`, linter preset `recommended`,
   `organizeImports: on`, `vcs.useIgnoreFile: true`.

3. npm scripts using the standard names every bhs-cs workspace uses:

   - `lint`: `biome check . --max-diagnostics=none --error-on-warnings`

   - `fmt`: `biome format --write .`

   - `typecheck`: `tsc --noEmit` (activates in Phase 2)

   - `test`: `node --test 'test/*.test.ts'` (activates in Phase 7)

4. Rework the Makefile: keep `SHELL := bash -O globstar`, add `.SUFFIXES:`;
   `check` = lint + typecheck + test; retire `pretty`/`ready`/`strict_lint`/
   `quick_lint`/`tidy` in favor of `fmt`/`check`.

5. Run the reformat, commit it alone, and record the commit hash in a new
   `.git-blame-ignore-revs` (with a comment), so `git blame` skips it.

6. Drop eslint/prettier config files and devDependencies.

Done when: `make check` passes warning-free with Biome only.

## Phase 2 — TypeScript

No build step: the server runs `.ts` directly on Node 26's native type
stripping. `tsc` is typecheck-only.

1. `tsconfig.json` copied from bhs-cs `tsconfig.base.json` (strict, `noEmit`,
   `module`/`moduleResolution: nodenext`, `allowImportingTsExtensions`,
   `erasableSyntaxOnly`, `verbatimModuleSyntax`, `resolveJsonModule`,
   `target: es2024`) plus an `include` of `*.ts`, `modules/**/*.ts`,
   `test/**/*.ts`, `types/**/*.d.ts`. Public browser JS
   (`public/js/*.js`) stays plain JS for now (see Out of scope).

2. Rename modules `.js` → `.ts` incrementally (they can coexist — Node runs
   both). All relative imports gain explicit `.ts` extensions; type-only
   imports use `import type` (verbatimModuleSyntax). No enums, no class
   parameter properties (erasableSyntaxOnly).

3. Add `types/` for hand-written declarations, following website:
   `types/pugsql.d.ts` (Phase 3) and `types/express-augmentations.d.ts`
   typing `Express.Locals` (`className`, `user`, role) and the session shape.

4. New `modules/config.ts` (website convention): read `process.env` exactly
   once into typed, defaulted, fail-fast-validated constants (`PORT`,
   `SESSION_SECRET`, `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URL`, `DB_DIR ?? '.'`,
   `DB_FILE ?? 'help.db'`, `ADMIN_EMAILS` comma-separated, `DEV_MODE`).
   Everything imports from there; nothing else touches `process.env`. A
   missing required var kills the boot with an actionable message.

   This is where the hardcoded `ADMINS` map leaves `storage.js`. (The
   `OTHER_NAMES` teacher-display-names map can move to config or a small
   JSON import — decide during implementation.)

5. Convert leaf modules first (`permissions`, `journal`, `crypto`, `oauth`,
   `require-login`), then `index.js` last. `storage.js` is not converted —
   it's replaced wholesale in Phase 3.

6. Drop `dotenv`; dev runs use `node --env-file=.env` (wired into the `dev`
   script/Makefile target).

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
   (classes/help/journal/prompts/users). Mostly a 1:1 transcription of the
   SQL already in `storage.js`, e.g.:

   ```sql
   -- :name queue :all
   -- All open help requests for a class, oldest first.
   select help.rowid as id, help.*, users.name
   from help join users using (email)
   where class_id = :class_id and closed_at is null
   order by created_at asc;
   ```

2. `modules/db.ts` (the only place a connection opens):

   ```ts
   const db = new DB(DB_PATH, 'schema.sql').addQueries(...);
   export default db;
   ```

   `schema.sql` stays idempotent and runs at every boot, exactly as now.
   Add the litestream-recommended pragmas at the top of `schema.sql`
   (`busy_timeout`, `synchronous = NORMAL`; pugsql's constructor already
   enables WAL — verify).

3. Multi-statement operations (`createClass`, `resyncClass`, `ensureUser`,
   `createPrompt`, `addJournalEntries`, `journalWithPrompts`) become plain
   TS functions using `db.transaction(() => ...)` — either in `db.ts` or a
   small `modules/logic.ts` if `db.ts` gets crowded.

4. `types/pugsql.d.ts` copied from website (the one sanctioned `any`, with
   its `biome-ignore` comment).

5. Retire: `modules/storage.js`, the `sqlite3` + `sqlite` dependencies,
   `db.js` (a fresh db now materializes on first boot; keep or simplify),
   `load-class.js` (rewrite on the new layer only if still used),
   `db-patches/` (already-applied one-offs — delete or leave as history).
   The `sessions` table queries die in Phase 5; drop the table from
   `schema.sql` then.

6. Convert `index.js` route handlers area by area (help, journal, prompts,
   classes, users) from callbacks to sync calls as their queries land.

7. Add a `test/queries.test.ts` (the lesson-planning trick): constructing
   the DB against a `:memory:` copy of the schema *is* the assertion that
   every named query prepares.

Done when: no callback-style db code remains; `sqlite3` is uninstalled.

## Phase 4 — Server structure and permissions

1. `index.ts` stays the composition root (small app — no `core.ts` split),
   but routes move into permission-regime routers, the website convention:

   - `modules/routes-public.ts` — `/health`, `/logout`, `/auth`

   - `modules/routes-user.ts` — logged-in pages (class page, own journal,
     help request/queue views)

   - `modules/routes-helper.ts` — help-item state changes (`helperOnly`)

   - `modules/routes-teacher.ts` — prompts, students, members, others'
     journals (`teacherOnly`)

   - `modules/routes-admin.ts` — `/classes` Google Classroom integration,
     `/users/:id` (`adminOnly`)

2. Rewrite `modules/permissions.ts` around website's `guardedRouter(...)`
   pattern: guards injected per-route on a router, one router per regime,
   instead of the current wrap-each-handler `teacherOnly(handler)` scheme.
   Keep an `ifTeacher`-equivalent in-handler check for the shared journal
   route.

3. The `/c/:class_id` middleware keeps loading class name + role into
   `res.locals` (now typed, and without the fire-after-`next()` race the
   current version has — the role lookup is sync now).

4. Add `morgan('dev')` request logging; sweep the ad-hoc `console.log`
   debugging.

5. Nunjucks filters: replace `nunjucks-date-filter` and
   `nunjucks-markdown-filter` with local filter modules exposing
   `install(env)` (website convention) — a `datefilter` on Temporal
   (Phase 6) and an `mdfilter` on `marked`. Resolves the existing FIXME
   about DOMPurify by sanitizing (or deliberately trusting and documenting)
   markdown output in one place.

Done when: every route lives in a regime router; `index.ts` is just
middleware order + mounts + listen.

## Phase 5 — Auth and sessions

Keep the hand-rolled Google OAuth dance, restructured along
`lesson-planning/routes_collab.ts` lines:

1. `cookie-session` (signed, `sameSite: 'lax'`, `httpOnly`) replaces the
   crypto-js AES cookie and `cookie-parser`. `SESSION_SECRET` from config,
   fail-fast (no silent default in prod; DEV_MODE may supply one).

2. Login flow: unauthenticated request → store `{ nonce, returnTo }` in the
   session → redirect to Google (`modules/oauth.ts` largely survives).
   `/auth` callback validates `state === nonce` from the cookie session —
   no db round-trip — then exchanges the code, `ensureUser`s, and writes
   `{ user, tokens }` into the session. Drop the `sessions` table, its
   queries, and `newSession`/`getSession`/`deleteSession`.

3. Google Classroom tokens stay in the session (as today) for the
   admin-only course-create/resync flows. Watch the ~4KB cookie limit;
   if tokens push past it, store only the access token + expiry.

4. `modules/crypto.ts` shrinks to `randomString` (or disappears in favor of
   `crypto.randomBytes(...).toString('base64url')`); crypto-js is
   uninstalled. The unused TOTP code goes.

5. DEV_MODE (website convention, explicit env var, never derived from
   NODE_ENV): registers no real OAuth, mounts a `/dev/login` router listing
   seeded users to become. Loud startup banner. This is what makes the
   Phase 7 tests runnable without secrets.

Done when: login works against real Google; `crypto-js`, `cookie-parser`,
and the `sessions` table are gone; DEV_MODE login works with no `.env`
secrets.

## Phase 6 — Dates

Replace `modules/dateformat.js` (hardcoded DST boundaries needing yearly
updates — a standing TODO) with real timezone handling:

1. Use Temporal (`@js-temporal/polyfill` is already a dependency; keep the
   polyfill until Node's native Temporal is unflagged) with
   `America/Los_Angeles` for `yyyymmdd`, `hhmm`, and `humandate` over the
   seconds-epoch timestamps.

2. `modules/journal.ts`'s day-grouping keys off the new functions
   unchanged. The "journal_days counts UTC days" caveat in the stats
   queries can be fixed here too if cheap, or left with its comment.

3. Delete the DST TODO from TODO.md.

Done when: dateformat tests (add a few in Phase 7) pass across a DST
boundary without hardcoded epochs.

## Phase 7 — Seed data and tests

`node:test` + `node:assert`, no framework, tests in `test/*.test.ts`.

1. `seed/fixtures.ts` + `seed/seed-dev.ts` (website convention): a
   deterministic dev world — a class or two, teacher/helper/student users,
   open + closed help requests, prompts and journal entries — loaded
   through the real db layer. `npm run dev:reset` = wipe db + reseed.

2. `test/queries.test.ts` — every named query prepares (from Phase 3).

3. `test/permissions.test.ts` — the website-style matrix: spawn the real
   server in DEV_MODE on a throwaway seeded db, log in as each persona
   (anonymous, student, helper, teacher, student-from-another-class, admin)
   via `/dev/login` with a cookie-jar `fetch` helper, and assert the
   URL × persona status matrix over the interesting routes (queue, help
   state changes, own vs. others' journals, prompts, members, /classes).

4. Targeted unit tests where logic is pure: `journal.ts` grouping,
   dateformat, `openPrompts`/`oldPrompts` filtering.

5. Wire `npm test` into `make check`.

Done when: `make check` (lint + typecheck + test) is the full local gate
and passes.

## Phase 8 — Deployment: Docker + fly.io + Litestream

Copy the website deployment shape, minus the monorepo staging machinery
(no workspaces — the build context is just this repo).

1. **Dockerfile** (`node:26-slim`): build stage downloads the static
   litestream release (pin the version by ARG) and installs the toolchain
   better-sqlite3 needs if no prebuilt binary matches (`python3 make g++`);
   manifests-first `npm ci --omit=dev` for layer caching; final stage
   copies the app, `litestream.yml` → `/etc/litestream.yml`, `run.sh`;
   `ENV DB_DIR=/data`, `EXPOSE`, `CMD ["/app/run.sh"]`.

2. **`run.sh`** (adapt website's verbatim): if `LITESTREAM_BUCKET_NAME`
   unset → loud banner, `exec node index.ts` bare; else restore the db
   only if missing (`litestream restore -if-replica-exists`), honoring a
   `$DB_DIR/no-restore` sentinel for deliberate resets; then
   `exec litestream replicate -exec "node index.ts"`.

3. **`litestream.yml`**: env-var interpolated, single db
   (`${DB_DIR}/${DB_FILE}`), S3-compatible replica (Tigris, like website)
   via the five `LITESTREAM_*` vars. Create a **new** bucket/path for this
   app — never reuse an old replica path.

4. **`fly.toml`**: pick an app name (e.g. `gigamonkeys-help`), region
   `sjc`, `[[mounts]]` data volume at `/data`, `[http_service]` with
   `force_https`, an HTTP check on the existing `GET /health`, and — since
   this app has no background work — `auto_stop_machines = 'suspend'`,
   `min_machines_running = 0` (the lesson-planning posture, not website's
   always-on). Single machine; SQLite requires it anyway.

5. **`.dockerignore`** as a whitelist (`*` then re-include what ships),
   the bhs-cs convention that makes `.env`/`*.db` leaks structurally
   impossible.

6. **Config/secrets** (simplified, no bhs-config): a tracked
   `template.env` documenting every variable; non-secret prod values in
   `fly.toml [env]`; secrets pushed with `fly secrets import` from a local
   gitignored env file, wrapped in a `make secrets` target. If bhs-config
   is ever published or this repo joins the monorepo, adopt a
   `config-manifest.ts` instead.

7. **Makefile targets**: `deploy` (runs `make check` first, then
   `fly deploy`), `secrets`, `logs`, `ssh`, `restart`. Retire
   `start`/`restart`/`stop` (pm2) and drop the pm2 dependency; `dev` stays
   nodemon (`--watch . -e ts,json,njk,html,sql --exec 'node
   --env-file=.env index.ts'`).

8. Keep `backup-db` but reimplement as website's `VACUUM INTO` script run
   over `fly ssh console` (secondary to litestream, not the primary
   backup).

Done when: the app runs on fly.dev with litestream replicating and a
restore drill has been performed (restore to a scratch path, open, check a
table — "replication never restored from is a hope, not a backup").

## Phase 9 — Cutover and decommission

Ordered checklist, once Phase 8 works against a scratch db:

1. Announce/schedule a brief outage (or do it outside class hours).

2. `backup-db` on EC2; stop the pm2 process; copy `help.db` off the box.

3. Put the prod db on the fly volume (sftp via `fly ssh`, or restore it
   into place), boot, verify against real data.

4. Add the fly hostname callback to the Google OAuth client's authorized
   redirect URIs (do this ahead of time — propagation is slow), set
   `REDIRECT_URL`/config accordingly.

5. Point `help.gigamonkeys.com` at the fly app (`fly certs add`), verify
   sign-in end-to-end on the real hostname.

6. Watch litestream generations appear in the bucket; do the restore
   drill against the real replica.

7. Decommission: remove the EC2 instance (snapshot the volume first),
   delete `bounce`/`connect`/`upload`/`download` and `ec2.env` references,
   archive `ec2-setup.txt`.

8. Rewrite CLAUDE.md for the new world (commands, architecture, deploy);
   prune TODO.md items this plan resolved.

## Out of scope (deliberately)

- Feature work from TODO.md (recurring prompts, websockets queue, profile
  pages, …) — this plan only modernizes what exists.

- Converting `public/js/*.js` (two tiny browser scripts) to a bundled
  client-TS setup — not worth an esbuild pipeline yet. Biome covers them
  as plain JS.

- Switching user identity from email to Google id (a TODO.md item and the
  website's model). Worth doing someday; it's a data migration, not a
  style alignment, and would bloat this plan.

- Nunjucks template rework beyond what the filter changes force.

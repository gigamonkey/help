# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Stale-content caveat:** this file was written against the `main`/
> `refresh` tree, ~3 years behind the code you are looking at. This branch
> (`update`, from `help`) is the live app: deployed on fly.io (app
> `bhs-help`) with Litestream — not EC2/pm2 — with Express 5,
> Google-id-keyed users (no hardcoded admins), and **no journal/prompt
> feature at all** (it moved to the bhs-cs `website/` app). Where this
> file and the tree disagree, trust the tree, and see "What the help branch
> already has" in `plans/adopt-bhs-cs-conventions.md`. This file gets
> regenerated in that plan's final phase.

## What this is

A help-queue web app for classes: students request help and answer journal
prompts; teachers manage the queue, prompts, and rosters. Single Express server
(`index.js`), Nunjucks templates (`views/`), SQLite database (`help.db`, not
checked in). ES modules throughout (`"type": "module"`).

## Commands

```bash
make setup      # npm install
make dev        # dev server via nodemon (watches js, json, njk, html)
make lint       # eslint over *.js, modules/, public/
make pretty     # prettier --write
make ready      # pretty + lint — run before committing
make start / restart / stop   # pm2, production only
node make-secret.js           # generate a value for SECRET in .env
```

There is no test suite (`npm test` is a stub).

The server needs a `.env` file with `PORT`, `SECRET` (cookie encryption key),
and Google OAuth credentials `CLIENT_ID`, `CLIENT_SECRET`, `REDIRECT_URL`.

Deployment is to an EC2 box via the shell scripts `bounce` (push, pull on
server, npm install, restart), `connect`, `upload`, `download`, and
`backup-db`; they source an untracked `ec2.env`. See `ec2-setup.txt` for
provisioning notes.

## Architecture

**Routes** all live in `index.js`. Class-scoped pages are under
`/c/:class_id/...`; a middleware on that prefix loads the class name and the
current user's role into `res.locals`. Admin-only Google Classroom integration
lives under `/classes` (create a class from a Classroom course, resync its
roster).

**Database layer**: all SQL is in `modules/storage.js`, a `DB` class wrapping
`sqlite3` with node-style `(err, data)` callbacks — the whole codebase is
callback-style, not promise-based (only the Google API calls use async/await).
`modules/schema.sql` is the DDL and is executed at every server startup, so it
must stay idempotent (`CREATE TABLE IF NOT EXISTS ...`). One-off data
migrations live in `db-patches/`. `db.js` is a standalone script that just
creates/initializes `help.db`.

**Auth** (`modules/require-login.js`, `modules/oauth.js`): Google OAuth,
hand-rolled. The entire session (user, Google tokens) is stored client-side in
an AES-encrypted cookie (`modules/crypto.js`, keyed by `SECRET`); the
`sessions` DB table is used only transiently to verify OAuth `state` during the
sign-in dance. Every route requires login except those in the `noAuthRequired`
map in `index.js`.

**Permissions** (`modules/permissions.js`): per-class roles (`teacher`,
`helper`, `student`) come from the `class_members` table; `is_admin` on `users`
is global. `index.js` builds route wrappers from these — `teacherOnly`,
`helperOnly`, `adminOnly` — that wrap handlers, plus `ifTeacher` for mid-handler
checks. Admin emails are hardcoded in `ADMINS` in `modules/storage.js`.

**Domain model**: a help request is "open" while `closed_at` is null (the
queue) and "done" once set. Journal prompts are two-level: `prompt_texts` are
reusable per-class texts; `prompts` are instances of a text with a lifespan
(`created_at`/`closed_at`). Students see open prompts they haven't yet answered;
journal entries optionally link back to the prompt they answered.

**Dates**: timestamps are seconds-resolution unix epoch from SQLite
(`unixepoch('now')`). `modules/dateformat.js` converts to Pacific time with
hardcoded DST boundaries that must be updated yearly (a known kludge; see
TODO.md).

## Style

ESLint is airbnb-base + prettier (config in `.eslintrc.json`); Prettier: 100
columns, single quotes, trailing commas. `snake_case` names coming from SQL
columns and URL params (`class_id`) are used as-is (camelcase rule is off).

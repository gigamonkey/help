# Room/period class settings and automatic queue switching

Let a teacher record which room and period each class meets in, then use
the [`@peterseibel/bells`](https://www.npmjs.com/package/@peterseibel/bells)
bell-schedule library to drive a per-room projector page that shows
whichever class's queue is in session in that room, switching
automatically as the periods change. A teacher opens `/r/303` on the
projector in the morning and never touches it again.

## Where things stand

- `classes` has `id`, `name`, `section`, `google_id` — no room, no
  period. The period is implicit in the free-text `section` ("Period 3",
  "P3"); `byPeriod` in classroom.ts already parses the first number out
  of it for homepage sorting.

- Classes are created and resynced from Google Classroom in
  routes-admin.ts (`createClass`/`resyncClass` in db.ts). The Classroom
  `Course` object has a `room` field we currently ignore.

- The projector view is `/c/:class_id/queue` (queue.njk), one class per
  URL, kept fresh by the SSE machinery: `modules/live.ts` (per-class
  subscriber registry, notify-only `queue` events), `public/js/live.js`
  (fragment-swap refresh of `#queue`), and `broadcast(class_id)` calls
  in the three queue-mutating handlers (`POST /c/:class_id/help` in
  routes-user.ts, `done`/`reopen` in routes-helper.ts).

- schema.sql is exec'd wholesale at every boot (pugsql's `DB`
  constructor), so it must stay idempotent; there is no migration
  mechanism yet. The raw better-sqlite3 handle is available as `db.db`.

- The app imports `Temporal` from `@js-temporal/polyfill` in
  dateformat.ts ("until Node's native Temporal is unflagged"). Node
  26.7 now ships `Temporal` as an unflagged global.

### The bells library (verified against v0.10.0 in a scratch project)

- `new BellSchedule(yearDataArray, { role, includeTags })` over calendar
  JSON; the companion `@peterseibel/bhs-calendars` package bundles ready
  BHS data (flat array of year objects; filter `id === 'bhs'`, sort by
  `firstDay`). Currently ships 2022-23 through 2026-27.

- `bells.currentOrNextPeriodNumber(instant?)` → the number of the period
  containing the instant, or the next numbered period later the same
  day, or null. Verified: during "Passing to Period 3" it returns 3;
  weekend/after-school returns null. Period numbers come from the
  default `/^Period (\d+)/` matcher, which matches the BHS calendar
  names.

- `bells.currentInterval(instant?)` → `{ name, type, start, end, ... }`
  covering periods, passing, before/after school, and multi-day breaks —
  `end` is exactly the next moment the room display could need to
  change.

- The library expects `globalThis.Temporal` rather than importing an
  implementation. It works on Node 26's native Temporal (verified: no
  polyfill assignment needed). Its types alias the global to the
  `temporal-polyfill` package's namespace, so that package must be
  installed (dev-only; never imported at runtime) for `tsc` to pass.
  With the project's tsconfig this typechecks clean.

- `@peterseibel/bhs-calendars` ships no type declarations; a three-line
  ambient d.ts (`declare module` returning `(YearData & { id: string })[]`)
  fixes that, and tsconfig's `types/**/*.d.ts` include already has a
  home for it.

- `setDebugTime(instant)` shifts the library's whole clock — perfect for
  demoing period switching in dev without waiting for real periods.

## Decisions

- **Room and period are plain nullable columns on `classes`** (`room
  TEXT`, `period INTEGER`), editable by the teacher on a new class
  settings page. Prefilled at class creation from Classroom (`course.room`,
  period parsed from `course.section` with the existing regex) but
  **never touched by resync** — Classroom's values are a starting guess;
  the teacher's edits win. Classes with either field unset simply don't
  participate in room switching; everything else works as today.

- **`currentOrNextPeriodNumber()` picks the class, not `periodAt()`.**
  During passing the room page already shows the incoming class, so the
  queue is up when students walk in; before school it shows period 1's
  class. After the last period, on weekends, holidays, and in summer it
  returns null and the page shows a "no class in session" state. Bind
  the schedule with `role: 'student'` and `includeTags: ['zero',
  'seventh']` so classes assigned to period 0 or 7 are visible.

- **Switching is client-driven off a server-stamped deadline.** Every
  render of the room fragment includes `data-refresh-at` (epoch seconds
  of `currentInterval().end`); the client arms a timer and re-fetches at
  that moment (+ a couple seconds of skew), swapping in the new class's
  queue, which carries the next deadline. No server-side timers, no
  per-connection scheduling — the same stateless request/refresh model
  the SSE work established. The existing reconnect-refresh behavior in
  live.js (hidden tab → reconnect on visible → refresh) covers a
  projector waking from a long sleep.

- **Live updates via a room SSE channel.** `live.ts` channels are just
  strings; the mutating handlers broadcast to `room:<room>` (the class's
  room, when set) in addition to the class channel. The room page
  subscribes to `/r/:room/events`, which never changes as periods roll
  over, so the EventSource stays stable across swaps. A change in a
  not-currently-in-session class of the same room causes a harmless
  extra refresh.

- **Room strings are trimmed and matched case-insensitively** (`collate
  nocase` in the lookup) so "G210" and "g210" are the same room. No
  registry of valid rooms — a room exists because some class names it.

- **One `BellSchedule` singleton in `modules/bells.ts`** built from
  `@peterseibel/bhs-calendars`, on native Temporal (no runtime polyfill,
  no global assignment). The room-resolution logic takes the schedule
  and an optional instant as parameters so tests can pass a synthetic
  calendar and fixed instants.

- **Degrade to the empty state, never 500.** Out-of-calendar dates
  (summer past the last loaded year, a missed yearly data update) make
  the bells queries return null or throw; the room page catches that and
  renders "no class" with a retry-in-an-hour deadline. Keeping
  `bhs-calendars` current becomes a yearly chore alongside the year-end
  reset (see Residue).

- **Drop `@js-temporal/polyfill` while we're here.** Node 26's Temporal
  is unflagged (the polyfill comment's stated expiry condition), and
  bells' ambient declaration types the global for free. dateformat.ts
  loses its import and uses the global; the dependency goes away. This
  is a separable step — if native Temporal misbehaves in some corner,
  revert just this and keep the feature (bells itself runs fine either
  way).

## Implementation

### 1. Dependencies and `modules/bells.ts`

- `npm install @peterseibel/bells @peterseibel/bhs-calendars` and
  `npm install -D temporal-polyfill` (types only).

- `types/bhs-calendars.d.ts`:

  ```ts
  declare module '@peterseibel/bhs-calendars' {
    import type { YearData } from '@peterseibel/bells';
    const calendars: (YearData & { id: string })[];
    export default calendars;
  }
  ```

- `modules/bells.ts`: filter the bundled data to `id === 'bhs'`, sort by
  `firstDay`, construct the singleton `BellSchedule` (`role: 'student'`,
  `includeTags: ['zero', 'seventh']`). Export it plus two pure helpers
  that take an explicit schedule (defaulting to the singleton) and an
  optional instant, both null-safe against out-of-calendar dates:

  - `currentPeriodNumber(schedule?, instant?)` → number | null
  - `nextSwitchEpoch(schedule?, instant?)` → epoch seconds of
    `currentInterval().end`, or a one-hour-out fallback when the
    calendar has nothing to say.

### 2. Schema and migration

- Add `room TEXT` and `period INTEGER` to the `CREATE TABLE IF NOT
  EXISTS classes` in schema.sql (fresh databases get them for free).

- Existing databases need `ALTER TABLE`, which isn't idempotent in plain
  SQL. Restructure db.ts's construction slightly: `new DB(...)`, then a
  small migration step that checks `db.db.pragma('table_info(classes)')`
  and `ALTER TABLE classes ADD COLUMN` each missing column, then
  `.addQueries(...)` (queries referencing the new columns must prepare
  after the columns exist). Keep it as a plain `migrate(db)` function in
  db.ts — two columns don't justify a framework.

### 3. Queries

In queries.sql:

- Extend `insertClass` with `:room` and `:period` (and `createClass` in
  db.ts to pass them).

- `updateClassSettings :run` — `update classes set room = :room, period
  = :period where id = :id` (teacher settings form). `updateClass`
  (resync) stays name/section only.

- `classSettings :get` — room and period for the settings form.

- `classForRoomPeriod :get` — the class meeting in a room during a
  period: `where room = :room collate nocase and period = :period`,
  `order by id limit 1` so a double-booked room+period is deterministic
  rather than random.

- `classRoom :get(room)` — a class's room, for the broadcast fan-out.

`queries.test.ts` proves they all prepare, no new test code needed.

### 4. Prefill from Classroom at create

- Export the `period()` section-parser from classroom.ts (it's the
  existing private helper behind `byPeriod`).

- In routes-admin.ts, both `create` paths pass `course.room ?? null` and
  the parsed period into `createClass`. Resync paths untouched.

### 5. Class settings page (teacher)

- `GET /c/:class_id/settings` and `POST /c/:class_id/settings` in
  routes-teacher.ts (the `guardedRouter(teacherOnly)` covers them).

- `views/settings.njk`: a small form — room (text, trimmed, empty →
  null) and period (`<input type="number" min="0" max="7">`, empty →
  null). POST validates (period must be an integer 0–7 or empty),
  saves via `updateClassSettings`, and redirects back to the settings
  page. When both fields are set, show a link to the room page
  (`/r/<room>`) so the teacher can find the projector URL.

- Link "Settings" from class.njk's teacher block, next to "Students".

### 6. The room page and its events stream

- `GET /r/:room` in routes-user.ts (any logged-in user — same regime as
  `/c/:class_id/queue`; app-level `requireLogin` already covers it; no
  class-context involved). Handler: `currentPeriodNumber()` →
  `classForRoomPeriod` → render `views/room.njk` with the class and its
  queue, or the no-class state; either way include `refresh_at` from
  `nextSwitchEpoch()`. Encode the room with the `encodeURIComponent`
  semantics Express gives us for free in `req.params`.

- `views/room.njk`: adapted from queue.njk. `body
  data-events="/r/{{room}}/events"`. Crucially the swap target `#queue`
  wraps *everything that changes at a period boundary*: the class-name
  heading, the cards-or-🎉 conditional (or the "No class in session in
  room X" state), and the `data-refresh-at` attribute (put it on the
  `#queue` element itself so every swap delivers the next deadline).

- `GET /r/:room/events` — one line: `subscribe(`room:${room}`, res)`
  (normalize the room the same way the lookup does).

- Broadcast fan-out: add `broadcastQueueChange(class_id)` (in live.ts,
  or a thin helper next to it) that does today's `broadcast(class_id)`
  plus `broadcast(`room:${room}`)` when `db.classRoom` finds one, and
  switch the three mutating handlers to it.

### 7. Client timer in live.js

- After initial load and after every `#queue` swap, read
  `data-refresh-at` from the current `#queue`; if present, set a single
  timeout for `refresh_at + 2s` (clearing any previous one) that calls
  the existing `refresh()`. Clamp the delay to a sane range (min a few
  seconds to avoid a tight loop if the clock is past the deadline, max
  ~6 hours — also keeps weekend-long break intervals under setTimeout's
  32-bit ceiling; a capped refresh is just a cheap no-op fetch).

- This lives in the existing coalescing `refresh()` machinery, so a
  timer firing during an SSE-triggered refresh stacks correctly.

### 8. Dev affordance: DEBUG_TIME

- Optional `DEBUG_TIME` env var (config.ts, the only process.env
  reader): an ISO datetime; when set **and DEV_MODE**, `modules/bells.ts`
  calls `setDebugTime` at load so the whole app pretends it's that
  moment (bells' debug clock keeps ticking forward from there). Document
  it in template.env. Makes "watch the room page flip from Period 2 to
  Period 4" a 30-second manual test: set it to one minute before a
  period boundary and watch.

### 9. Seeds and tests

- `seed/fixtures.ts`: give both classes a room and period matching their
  sections (`apcs`: room "303", period 4; `intro`: room "303", period
  2) — one shared room makes the switching demo work out of the box.
  The permissions matrix depends on fixture ids, so update the matrix in
  the same change if needed.

- permissions.test.ts: add matrix rows for `GET/POST
  /c/:class_id/settings` (teacher-only), `GET /r/303` and `GET
  /r/303/events` (any logged-in user; anonymous → redirect). The room
  page returns 200 regardless of wall-clock time — the no-class state is
  still a 200 — so the matrix stays time-independent. The events row
  needs the same never-ending-response handling as the existing
  `/c/:class_id/events` row.

- New `test/bells.test.ts`: build a `BellSchedule` from a small
  synthetic calendar fixture (one year, NORMAL schedule, a couple of
  periods) and drive `currentPeriodNumber`/`nextSwitchEpoch` with
  explicit instants: mid-period, passing (expect the *next* period),
  before school, after school, weekend, and out-of-calendar (expect null
  / the fallback). Synthetic data means the test never rots as
  bhs-calendars gains and sheds years.

- Room-resolution round trip: a handler-level test in the spawned-server
  setup is time-dependent, so keep the end-to-end check manual (below)
  and let the unit tests plus `classForRoomPeriod` preparation carry the
  logic.

### 10. Verify

- `make check`, then dev-mode manual pass: `npm run dev:reset`, set
  `DEBUG_TIME` to a Wednesday 09:55 (mid period 2), load `/r/303` →
  Intro CS queue; post a request in Intro → appears live via the room
  stream; restart with `DEBUG_TIME` a minute before period 2 ends →
  watch the page flip to the no-class/period-4 progression without a
  reload.

- Confirm `.dockerignore`'s whitelist covers the new files (`modules/`,
  `views/`, `types/` — add `types/` if it isn't listed).

- After deploy: leave `/r/<real room>` open across a real period change.

## Out of scope

- Sorting homepage memberships by the stored `period` instead of parsing
  `section` — trivial follow-up once teachers have filled the column in.

- Auto-redirecting students to their currently-in-session class — a
  different feature (and students are usually in exactly one class here
  anyway).

- Per-day `includeTags` configuration, multiple schools/calendars, or
  teacher-editable bell schedules — the app is BHS-specific and
  `bhs-calendars` is the source of truth.

- Showing bell-schedule chrome (time left in period, next period) on
  queue pages — cute, easy later with the same singleton, not this
  plan.

- Multi-class rooms in the *same* period (co-taught sections sharing a
  queue) — `classForRoomPeriod` picks deterministically; real support
  would need a many-to-one model.

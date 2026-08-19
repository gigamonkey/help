# Live queue updates with Server-Sent Events

Push queue changes to open pages the moment they happen: a new question
appears on the projector and on every open "Up next" page immediately,
instead of on the next 15-second reload (the queue page) or never (every
other page).

## Where things stand

- `/c/:class_id/queue` (queue.njk, the projector view) reloads the whole
  page every 15 seconds via `public/js/auto-update.js` — up to 15 seconds
  of lag, plus a visible flicker on every reload.

- `/c/:class_id/help` (up-next.njk, the student view with the question
  form) and `/c/:class_id/done` are static until manually reloaded.

- The queue changes in exactly three handlers: `POST /c/:class_id/help`
  (`requestHelp`, routes-user.ts), `/c/:class_id/help/:id/done`
  (`finishHelp`) and `/c/:class_id/help/:id/reopen` (`reopenHelp`), both
  in routes-helper.ts.

- The app is a single Node process on a single fly machine with SQLite:
  every write goes through this one process, so an in-process subscriber
  registry sees every change. No pub/sub infrastructure needed.

## Decisions

- **SSE, not WebSockets or faster polling.** The data flow is strictly
  server→browser; SSE is plain HTTP, needs zero dependencies on either
  side, and the browser's `EventSource` reconnects automatically.

- **Notify-only events.** The event carries no data — just "this class's
  queue changed". Clients respond by re-fetching the page they are
  already looking at, so the stream exposes nothing the pages don't and
  the endpoint can live in the same permission regime as those pages
  (routes-user: any logged-in user; class-context.ts already 404s
  unknown classes). No per-role event filtering to design.

- **Broadcast on every queue mutation, not just new questions.** Close
  and reopen change what the pages show too; it's the same one-line call
  in each handler.

- **Refresh by fragment swap, not `location.reload()`.** Up-next has the
  question form; a reload triggered by *someone else's* post would eat a
  half-typed question. Instead the client fetches the current URL and
  swaps a stable wrapper element. The projector benefits too — no
  flicker. `update-times.js` already rescans `.time` elements every
  second, so freshly swapped-in cards need no re-wiring.

- **Heartbeat comments every ~25 seconds.** Keeps the fly proxy (and any
  other intermediary) from idling out a quiet connection, and a failed
  heartbeat write is how the server notices and reaps dead connections.

- **Hidden tabs disconnect; refresh on (re)connect.** On
  `visibilitychange` to hidden, close the `EventSource`; on visible,
  reconnect. Every `open` after a gap triggers one refresh, so anything
  missed while disconnected — nodemon restart, deploy, fly
  suspend/resume, laptop lid closed — can't leave a stale page. This
  also matters for `auto_stop_machines = 'suspend'`: open SSE
  connections hold the machine awake, and a projector tab left open
  overnight shouldn't pin it. Foreground tabs keeping the machine awake
  during class is fine — that's the app doing its job.

## Implementation

### 1. `modules/live.ts` — subscriber registry

A small module, no dependencies:

- `Map<string, Set<Response>>` keyed by `class_id`.

- `subscribe(class_id, res)`: write the SSE headers (`Content-Type:
  text/event-stream`, `Cache-Control: no-store`), `res.flushHeaders()`,
  send `retry: 2000` and an opening comment, add to the set, and remove
  on the response's `close` event.

- `broadcast(class_id)`: write `event: queue\ndata:\n\n` to every
  subscriber for the class; a throwing write drops that subscriber.

- One module-level `setInterval` (unref'd, so it never holds the process
  open) writes a `: ping` comment to every subscriber; write failures
  reap dead connections.

### 2. The stream route

`GET /c/:class_id/events` in routes-user.ts — one line calling
`subscribe`. Nothing else: login middleware and class-context.ts already
ran.

### 3. Broadcast calls

`live.broadcast(class_id)` after `requestHelp` in routes-user.ts and
after `finishHelp` / `reopenHelp` in routes-helper.ts (in the `done`
handler, only on the branch that actually closes).

### 4. Templates: a stable swap target

In help-items.njk and queue.njk, wrap the whole cards-or-empty
conditional in `<div id="queue">…</div>` so the swap target exists in
both the empty and non-empty states and the swap handles transitions
between them for free.

### 5. `public/js/live.js` — the client

Replaces auto-update.js (delete it):

- The templates put the stream URL on the body (e.g.
  `data-events="/c/{{class_id}}/events"`) — more robust than deriving it
  from `location.pathname`.

- On the `queue` event, and on `open` when it follows a disconnect:
  `fetch(location.href)`, parse with `DOMParser`, replace `#queue`.
  Coalesce: if a refresh is in flight when another trigger arrives, run
  one more afterwards rather than stacking fetches.

- `visibilitychange`: hidden → `close()`; visible → new `EventSource`
  (whose `open` refreshes).

- Wire it into help-items.njk's scripts block (up-next and done inherit
  it) and queue.njk.

### 6. Tests

- queries.test.ts and dates.test.ts: untouched.

- permissions.test.ts: add `/c/:class_id/events` to the URL × persona
  matrix. Caveat: an SSE response never ends. The `Client` helper only
  reads status and headers, which arrive immediately, but the open body
  would leak connections — cancel `res.body` (or use an
  `AbortController`) for this row so the test process exits cleanly.

- One new end-to-end test (same spawned-server setup): subscribe to
  `/c/:class_id/events` as one persona, `POST /c/:class_id/help` as
  another, and assert an event arrives on the stream within a timeout.
  This proves the whole wiring — route, registry, broadcast call.

### 7. Verify on the deployed app

- Leave a queue page idle well past the fly proxy's idle timeout and
  confirm the heartbeats keep the stream alive (or that reconnect +
  refresh papers over a drop invisibly).

- Confirm a hidden/closed tab actually releases its connection so the
  machine can suspend again.

- Deploy restarts: confirm open pages recover via reconnect + refresh
  with no user-visible error.

## Out of scope

- Live updates on the single-item help.njk page — low value, easy to add
  later with the same event.

- Fine-grained DOM patching (morphdom etc.) — a full fragment swap is
  plenty at classroom scale (tens of clients per class).

- Multi-process or multi-machine fan-out — the app is single-process by
  design (SQLite); if that ever changes, this module is the one place
  that would need a real pub/sub.

- The HTTP/1.1 six-connections-per-origin limit only affects local dev
  with many tabs open; production is HTTP/2 via the fly proxy. Not worth
  engineering around.

## Changes to the plan

- **Dead connections are reaped by the response's `close` event, not by
  write failures** — `res.write` on a closed response doesn't throw
  synchronously, so the planned "a throwing write drops that subscriber"
  handling was unnecessary; `subscribe` removes the response from the set
  on `close`, and heartbeats/broadcasts to already-closed responses are
  harmless no-ops in the meantime.

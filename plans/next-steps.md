# Next steps

Where things stand (2026-08-19): the modernization is done and merged —
`main` is the trunk, the app is TypeScript on Node 26 with
pugsql/better-sqlite3, tested with node:test, and deployed to fly.io
(`bhs-help`) with Litestream. Live queue updates over SSE and the
`make year-end` archive-and-reset machinery have both landed. One
feature plan is queued up and not started.

## Remaining plans

- `room-queue-switching.md` — teachers set each class's room and period
  on a new settings page; a per-room projector page (`/r/:room`) uses
  `@peterseibel/bells` + `@peterseibel/bhs-calendars` to show whichever
  class is in session and switch automatically at period boundaries.
  Builds on the landed SSE machinery; ready to start.

## Residue / loose ends

- First real `make year-end` run happens at actual year end: verify the
  old Litestream generation's lifetime in the bucket after the reset, do
  the restore drill against the new generation (the annual drill the
  modernization left outstanding), move the downloaded archive to
  durable storage, and prune the volume copy. Checklist in
  `done/year-end-reset.md` Phase 4.

- SSE deployed-app verification (see `done/sse-live-updates.md` §7):
  confirm heartbeats survive the fly proxy's idle timeout, hidden tabs
  release their connections so the machine can suspend, and open pages
  recover invisibly across a deploy.

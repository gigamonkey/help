# Next steps

Where things stand (2026-07-28): the live app runs on fly.io (`bhs-help`)
with Litestream, deployed from the **`help` branch** — `main` and `refresh`
are stale (EC2-era). The **`update` branch** (created from `help`, with the
`refresh` plan commits cherry-picked onto it) is where the modernization
happens. The code is still plain JS with callback-style sqlite3; the plan
has been written but not started.

## Remaining plans

- `adopt-bhs-cs-conventions.md` — bring the app in line with the coding
  conventions of the bhs-cs monorepo apps (TypeScript on Node 26, Biome,
  pugsql/better-sqlite3, cookie-session auth, node:test) and polish the
  existing fly.io/Litestream deployment. The rebase-onto-`help` part of
  Phase 0 is done (this branch); the EC2-leftover sweep is next, then the
  rest lands in order, each phase deployable.

## Residue / loose ends

- CLAUDE.md in this branch describes the stale tree; it carries a caveat
  note and gets regenerated in the plan's final phase.

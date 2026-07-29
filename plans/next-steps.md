# Next steps

Where things stand (2026-07-28): the live app runs on fly.io (`bhs-help`)
with Litestream, deployed from the **`help` branch** — `main` and `refresh`
are stale (EC2-era). The code is still plain JS with callback-style sqlite3;
a modernization plan has been written but not started.

## Remaining plans

- `adopt-bhs-cs-conventions.md` — bring the app in line with the coding
  conventions of the bhs-cs monorepo apps (TypeScript on Node 26, Biome,
  pugsql/better-sqlite3, cookie-session auth, node:test) and polish the
  existing fly.io/Litestream deployment. Phase 0 (rebase this work onto
  `help`, sweep EC2-era leftovers) must come first; the rest lands in
  order, each phase deployable.

## Residue / loose ends

- CLAUDE.md in this branch describes the stale tree; it carries a caveat
  note and gets regenerated in the plan's final phase.

# Next steps

Where things stand (2026-07-28): the app works in production on EC2 but is
stylistically old — plain JS, callback-style sqlite3, eslint/prettier, pm2.
A modernization plan has been written but not started.

## Remaining plans

- `adopt-bhs-cs-conventions.md` — bring the app in line with the coding and
  deployment conventions of the bhs-cs monorepo apps (TypeScript on Node 26,
  Biome, pugsql/better-sqlite3, cookie-session auth, node:test, fly.io +
  Litestream). Nine phases, each landable separately; Phases 1–2 (tooling,
  TypeScript) come first, Phase 9 is the production cutover off EC2.

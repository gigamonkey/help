/*
 * Wipe the dev database and reseed it with the fixtures world:
 *
 *   npm run dev:reset
 *
 * Defaults DEV_MODE on so no secrets are needed; imports are dynamic
 * because config reads the environment (and db.ts opens the database) at
 * import time.
 */

import fs from 'node:fs';
import process from 'node:process';

process.env.DEV_MODE ??= 'true';

const { DB_PATH } = await import('../modules/config.ts');

for (const suffix of ['', '-wal', '-shm']) {
  fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
}

const { seed } = await import('./fixtures.ts');
seed();

console.log(`Seeded ${DB_PATH}`);

import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

/*
 * The year-end reset logic in boot-prep.sh, exercised in bare mode
 * (no LITESTREAM_BUCKET_NAME) against scratch directories.
 */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const env = (dbDir: string): NodeJS.ProcessEnv => {
  const e: NodeJS.ProcessEnv = {
    ...process.env,
    DEV_MODE: 'true',
    DB_DIR: dbDir,
    DB_FILE: 'test.db',
  };
  delete e.LITESTREAM_BUCKET_NAME;
  return e;
};

const bootPrep = (dbDir: string): string =>
  execFileSync('bash', ['boot-prep.sh'], { cwd: ROOT, env: env(dbDir) }).toString();

const seededDir = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'year-end-'));
  execFileSync('node', ['seed/seed-dev.ts'], { cwd: ROOT, env: env(dir) });
  return dir;
};

const exists = (...parts: string[]) => fs.existsSync(path.join(...parts));

// Query via the sqlite3 CLI (as an operator inspecting an archive would);
// unlike an unclosed library handle it leaves no -wal/-shm files behind.
const query = (file: string, sql: string): string =>
  execFileSync('sqlite3', [file, sql]).toString().trim();

const archivesIn = (dir: string): string[] =>
  fs.readdirSync(path.join(dir, 'archives')).filter((f) => /^help-.*\.db$/.test(f));

test('reset-year archives the db, removes it, and arms no-restore', () => {
  const dir = seededDir();
  try {
    fs.writeFileSync(path.join(dir, 'reset-year'), '');
    const out = bootPrep(dir);
    assert.match(out, /YEAR-END RESET/);

    // The archive exists, is intact, and holds the seeded world (counts
    // match seed/fixtures.ts).
    const archives = archivesIn(dir);
    assert.equal(archives.length, 1);
    assert.match(archives[0] as string, /^help-\d{8}(T\d{6})?\.db$/);
    const archive = path.join(dir, 'archives', archives[0] as string);
    assert.equal(query(archive, 'pragma integrity_check;'), 'ok');
    assert.equal(query(archive, 'select count(*) from users;'), '6');
    assert.equal(query(archive, 'select count(*) from help;'), '4');

    // The db is gone, the sentinel is consumed, and no-restore is armed
    // (inert in bare mode, consumed by the restore logic under litestream).
    assert.ok(!exists(dir, 'test.db'));
    assert.ok(!exists(dir, 'reset-year'));
    assert.ok(exists(dir, 'no-restore'));

    // Running boot-prep again is a no-op normal boot: no new archive, no
    // resurrected db.
    bootPrep(dir);
    assert.equal(archivesIn(dir).length, 1);
    assert.ok(!exists(dir, 'test.db'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('without a sentinel boot-prep leaves a seeded db alone', () => {
  const dir = seededDir();
  try {
    const before = fs.statSync(path.join(dir, 'test.db')).mtimeMs;
    const out = bootPrep(dir);
    assert.equal(out, '');
    assert.ok(exists(dir, 'test.db'));
    assert.equal(fs.statSync(path.join(dir, 'test.db')).mtimeMs, before);
    assert.ok(!exists(dir, 'archives'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('reset-year with no database still starts fresh', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'year-end-'));
  try {
    fs.writeFileSync(path.join(dir, 'reset-year'), '');
    const out = bootPrep(dir);
    assert.match(out, /no database/);
    assert.ok(!exists(dir, 'archives'));
    assert.ok(!exists(dir, 'reset-year'));
    assert.ok(exists(dir, 'no-restore'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

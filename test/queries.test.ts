import assert from 'node:assert';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DB } from 'pugsql';

const DIRNAME = path.dirname(fileURLToPath(import.meta.url));
const MODULES = path.join(DIRNAME, '..', 'modules');

/*
 * Constructing the DB against an in-memory copy of the schema prepares every
 * named query in queries.sql, so this is the assertion that they all at
 * least parse and refer to real tables and columns.
 */
test('every named query prepares against the schema', () => {
  const db = new DB(':memory:', path.join(MODULES, 'schema.sql')).addQueries(
    path.join(MODULES, 'queries.sql'),
  );
  assert.ok(db.userById);
  assert.ok(db.queue);
});

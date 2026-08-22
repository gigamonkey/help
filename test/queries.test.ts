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

test('updateClass (resync) fills blank room/period, never overwrites', () => {
  const db = new DB(':memory:', path.join(MODULES, 'schema.sql')).addQueries(
    path.join(MODULES, 'queries.sql'),
  );
  db.insertClass({
    id: 'c1',
    name: 'CS',
    section: 'Period 2',
    google_id: 'g1',
    room: null,
    period: null,
  });

  // Blank settings pick up Classroom's values.
  db.updateClass({ id: 'c1', name: 'CS', section: 'Period 2', room: '303', period: 2 });
  assert.deepEqual(db.classSettings({ class_id: 'c1' }), { room: '303', period: 2 });

  // Set values survive a resync with different (or missing) values.
  db.updateClass({ id: 'c1', name: 'CS', section: 'Period 3', room: 'G210', period: 3 });
  assert.deepEqual(db.classSettings({ class_id: 'c1' }), { room: '303', period: 2 });
  db.updateClass({ id: 'c1', name: 'CS', section: null, room: null, period: null });
  assert.deepEqual(db.classSettings({ class_id: 'c1' }), { room: '303', period: 2 });
});

import assert from 'node:assert';
import { test } from 'node:test';
import { byPeriod } from '../modules/classroom.ts';

test('byPeriod: numeric period order, then alphabetical, no-period last', () => {
  const names = [
    'AP CS - Period 3',
    'Zebra Studies',
    'Intro CS - 3rd period',
    'AP CS - Period 10',
    'Intro CS - 1st Period',
    'Beekeeping',
  ];
  const sorted = names
    .map((name) => ({ name }))
    .sort(byPeriod)
    .map((c) => c.name);
  assert.deepEqual(sorted, [
    'Intro CS - 1st Period',
    'AP CS - Period 3',
    'Intro CS - 3rd period',
    'AP CS - Period 10',
    'Beekeeping',
    'Zebra Studies',
  ]);
});

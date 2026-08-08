import assert from 'node:assert';
import { test } from 'node:test';
import { byPeriod } from '../modules/classroom.ts';

test('byPeriod: section first, name fallback, numeric order, no-period last', () => {
  const classes = [
    { name: 'AP CS', section: 'Period 4' },
    { name: 'Zebra Studies', section: null },
    // No stored section: the period comes out of the name.
    { name: 'Robotics - Period 1', section: null },
    { name: 'Data Structures', section: '3rd period' },
    { name: 'Advisory', section: 'Period 10' },
    { name: 'Beekeeping' },
  ];
  assert.deepEqual(
    classes.sort(byPeriod).map((c) => c.name),
    ['Robotics - Period 1', 'Data Structures', 'AP CS', 'Advisory', 'Beekeeping', 'Zebra Studies'],
  );
});

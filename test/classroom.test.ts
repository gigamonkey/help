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

test('byPeriod: any number in the section counts as the period', () => {
  const classes = [
    { name: 'AP CS', section: 'P6' },
    { name: 'Intro CS', section: '2' },
    { name: 'Data Structures', section: 'Per. 4' },
    // In the name, only a "Period N" shape counts — CS 101 is not period 101.
    { name: 'CS 101', section: null },
  ];
  assert.deepEqual(
    classes.sort(byPeriod).map((c) => c.name),
    ['Intro CS', 'Data Structures', 'AP CS', 'CS 101'],
  );
});

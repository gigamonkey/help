import assert from 'node:assert';
import { test } from 'node:test';
import { byPeriod } from '../modules/classroom.ts';

test('byPeriod: first number in the section, sectionless last, alphabetical ties', () => {
  const classes = [
    { name: 'AP CS', section: 'P6' },
    { name: 'Intro CS', section: '2' },
    { name: 'Zebra Studies', section: 'Period 3' },
    { name: 'Data Structures', section: 'Per. 4' },
    { name: 'Advisory', section: 'Period 10' },
    // Numbers in the name never count; only the section names the period.
    { name: 'CS 101', section: null },
    { name: 'Beekeeping' },
  ];
  assert.deepEqual(
    classes.sort(byPeriod).map((c) => c.name),
    ['Intro CS', 'Zebra Studies', 'Data Structures', 'AP CS', 'Advisory', 'Beekeeping', 'CS 101'],
  );
});

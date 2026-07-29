import assert from 'node:assert';
import { test } from 'node:test';
import { hhmm, humandate, yyyymmdd } from '../modules/dateformat.ts';

/*
 * The point of the Temporal rewrite: correct across DST boundaries without
 * yearly maintenance.
 */

// One second before the US 2026 spring-forward (2026-03-08 02:00 PST -> 03:00 PDT).
const beforeSpring = Date.UTC(2026, 2, 8, 9, 59, 59) / 1000;
const afterSpring = beforeSpring + 1;

// One second before the US 2026 fall-back (2026-11-01 02:00 PDT -> 01:00 PST).
const beforeFall = Date.UTC(2026, 10, 1, 8, 59, 59) / 1000;
const afterFall = beforeFall + 1;

test('hhmm across the spring-forward boundary', () => {
  assert.equal(hhmm(beforeSpring), '01:59 am');
  assert.equal(hhmm(afterSpring), '03:00 am');
});

test('hhmm across the fall-back boundary', () => {
  assert.equal(hhmm(beforeFall), '01:59 am');
  assert.equal(hhmm(afterFall), '01:00 am');
});

test('yyyymmdd stays on the same California day across both boundaries', () => {
  assert.equal(yyyymmdd(beforeSpring), '2026-03-08');
  assert.equal(yyyymmdd(afterSpring), '2026-03-08');
  assert.equal(yyyymmdd(beforeFall), '2026-11-01');
  assert.equal(yyyymmdd(afterFall), '2026-11-01');
});

test('humandate', () => {
  assert.equal(humandate(afterSpring), 'Sunday, March 8, 2026');
  // Afternoon UTC lands on the previous California day near midnight? No:
  // 2026-07-04 19:00 UTC is noon PDT.
  assert.equal(humandate(Date.UTC(2026, 6, 4, 19, 0, 0) / 1000), 'Saturday, July 4, 2026');
});

test('hhmm pads and wraps 12-hour times', () => {
  // 2026-01-15 20:05 UTC == 12:05 pm PST.
  assert.equal(hhmm(Date.UTC(2026, 0, 15, 20, 5, 0) / 1000), '12:05 pm');
  // 2026-01-15 08:00 UTC == 12:00 am PST (midnight).
  assert.equal(hhmm(Date.UTC(2026, 0, 15, 8, 0, 0) / 1000), '12:00 am');
});

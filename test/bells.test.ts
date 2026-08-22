import assert from 'node:assert';
import process from 'node:process';
import { test } from 'node:test';
import { BellSchedule, type YearData } from '@peterseibel/bells';

/*
 * The room-switching helpers, driven with explicit instants against a
 * synthetic calendar (so the tests never rot as @peterseibel/bhs-calendars
 * gains and sheds years). The schedule options mirror modules/bells.ts.
 *
 * The import is dynamic because modules/bells.ts pulls in config.ts, which
 * reads the environment at import time (and exits without DEV_MODE).
 */

process.env.DEV_MODE ??= 'true';
const { currentPeriodNumber, secondsToNextSwitch } = await import('../modules/bells.ts');

const TIMEZONE = 'America/Los_Angeles';

// 2030-08-14 and 2031-06-06 are a Wednesday and a Friday; 2030-11-11 is a
// Monday (the holiday); 2030-09-14 is a Saturday.
const CALENDAR: YearData[] = [
  {
    year: '2030-2031',
    timezone: TIMEZONE,
    firstDay: '2030-08-14',
    lastDay: '2031-06-06',
    holidays: ['2030-11-11'],
    schedules: {
      NORMAL: [
        { name: 'Period 0', start: '7:26', end: '8:24', tags: ['optional', 'zero'] },
        { name: 'Period 1', start: '8:30', end: '9:28' },
        { name: 'Period 2', start: '9:34', end: '10:37' },
        { name: 'Period 3', start: '10:43', end: '11:41' },
      ],
    },
  },
];

const bells = new BellSchedule(CALENDAR, { role: 'student', includeTags: ['zero', 'seventh'] });

// A moment on a plain school day (Wednesday 2030-09-11), school time.
const at = (time: string, date = '2030-09-11'): Temporal.Instant =>
  Temporal.PlainDateTime.from(`${date}T${time}`).toZonedDateTime(TIMEZONE).toInstant();

test('mid-period: the period in progress', () => {
  assert.equal(currentPeriodNumber(at('08:45'), bells), 1);
  assert.equal(currentPeriodNumber(at('11:00'), bells), 3);
});

test('passing: the incoming period', () => {
  assert.equal(currentPeriodNumber(at('09:30'), bells), 2);
});

test('before school: the first period of the day, including optional period 0', () => {
  assert.equal(currentPeriodNumber(at('06:00'), bells), 0);
});

test('after school, weekend, holiday: no class', () => {
  assert.equal(currentPeriodNumber(at('15:00'), bells), null);
  assert.equal(currentPeriodNumber(at('12:00', '2030-09-14'), bells), null);
  assert.equal(currentPeriodNumber(at('09:00', '2030-11-11'), bells), null);
});

test('out of calendar: null, never a throw', () => {
  assert.equal(currentPeriodNumber(at('09:00', '2032-01-15'), bells), null);
});

test('next switch is the end of the current interval', () => {
  // 08:45 in Period 1, which ends 09:28: 43 minutes.
  assert.equal(secondsToNextSwitch(at('08:45'), bells), 43 * 60);
  // 09:30 in passing, which ends 09:34 when Period 2 starts.
  assert.equal(secondsToNextSwitch(at('09:30'), bells), 4 * 60);
});

test('next switch off school hours is positive and bounded-sane', () => {
  for (const instant of [at('15:00'), at('12:00', '2030-09-14'), at('09:00', '2030-11-11')]) {
    const seconds = secondsToNextSwitch(instant, bells);
    assert.ok(seconds > 0, `positive (${seconds})`);
    assert.ok(seconds <= 5 * 24 * 60 * 60, `at most a long weekend (${seconds})`);
  }
});

test('next switch out of calendar: the retry-in-an-hour fallback', () => {
  assert.equal(secondsToNextSwitch(at('09:00', '2032-01-15'), bells), 3600);
});

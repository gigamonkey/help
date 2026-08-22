import {
  BellSchedule,
  type BellScheduleOptions,
  clearDebugTime,
  getDebugOffset,
  setDebugTime,
} from '@peterseibel/bells';
import allCalendars from '@peterseibel/bhs-calendars';
import { DEBUG_TIME } from './config.ts';

/*
 * The BHS bell schedule, for switching a room's queue page from class to
 * class as the periods change. bells runs on Node's native Temporal
 * global; the helpers take an optional schedule and instant so tests can
 * pass a synthetic calendar and fixed moments. Both are null-safe against
 * out-of-calendar dates (summer past the last loaded year, a missed
 * yearly data update): the room page degrades to its no-class state
 * rather than throwing.
 */

const years = allCalendars
  .filter((y) => y.id === 'bhs')
  .sort((a, b) => (a.firstDay < b.firstDay ? -1 : 1));

/*
 * "Period Ext" carries no number in the calendar; we store an Ext class's
 * period as 8 (the UI shows "Ext"), so the mapping lives here and in the
 * period dropdown (views/period-select.njk).
 */
export const EXT_PERIOD = 8;

/*
 * includeTags makes the optional periods visible so classes assigned to
 * period 0, 7, or Ext participate in room switching. Period 7 and Ext
 * overlap in the calendar (3:39 on); bells reports Period 7 during the
 * overlap and Ext for its remaining tail, so an Ext class's room shows it
 * only once period 7 is over.
 */
export const SCHEDULE_OPTIONS: BellScheduleOptions = {
  role: 'student',
  includeTags: ['zero', 'seventh', 'ext'],
  periodNumber: (p) => {
    const m = /^Period (\d+)\b/.exec(p.name);
    if (m) {
      return Number(m[1]);
    }
    return p.name === 'Period Ext' ? EXT_PERIOD : null;
  },
};

export const schedule = new BellSchedule(years, SCHEDULE_OPTIONS);

/*
 * Point bells' clock at a simulated wall-clock moment in the school's
 * timezone (e.g. "2026-08-19T09:55"), so period switching can be
 * exercised without waiting for a real school day; null (or '') returns
 * to the real clock. The simulated clock keeps ticking forward from the
 * given moment, and is process-global: it shifts the bell schedule for
 * every page until cleared or the server restarts.
 */
export const setSimulatedTime = (time: string | null): void => {
  if (time) {
    setDebugTime(Temporal.PlainDateTime.from(time).toZonedDateTime(schedule.timezone).toInstant());
  } else {
    clearDebugTime();
  }
};

/*
 * The current simulated wall-clock time ("YYYY-MM-DDTHH:MM", ready for a
 * datetime-local input), or null when bells runs on the real clock.
 */
export const simulatedNow = (): string | null => {
  const offset = getDebugOffset();
  if (offset === null) {
    return null;
  }
  return Temporal.Now.instant()
    .add(offset)
    .toZonedDateTimeISO(schedule.timezone)
    .toPlainDateTime()
    .toString({ smallestUnit: 'minute' });
};

// DEBUG_TIME (dev-only, see config.ts) arms the simulated clock at boot.
if (DEBUG_TIME) {
  setSimulatedTime(DEBUG_TIME);
  console.log(`*** DEBUG_TIME: bells pretends it is ${DEBUG_TIME} (${schedule.timezone}). ***`);
}

/*
 * The period whose class a room should show right now: the period
 * containing the moment or, during passing (and before school), the next
 * one later the same day — so the incoming class's queue is up before the
 * students are. Null when no period is coming (after school, weekends,
 * holidays, summer).
 */
export const currentPeriodNumber = (
  instant?: Temporal.Instant,
  bells: BellSchedule = schedule,
): number | null => {
  try {
    return bells.currentOrNextPeriodNumber(instant);
  } catch {
    return null;
  }
};

/*
 * The period numbers a room's class could be meeting under right now, in
 * priority order. Usually just the current period, but Period Ext runs
 * alongside and past period 7, and bells reports 7 during the overlap —
 * so while 7 is current, Ext is a fallback: a room with an Ext class and
 * no 7th-period class shows the Ext queue for Ext's whole duration.
 */
export const currentPeriodNumbers = (
  instant?: Temporal.Instant,
  bells: BellSchedule = schedule,
): number[] => {
  const period = currentPeriodNumber(instant, bells);
  if (period === null) {
    return [];
  }
  return period === 7 ? [7, EXT_PERIOD] : [period];
};

/*
 * Seconds until the next moment the room display could need to change:
 * the end of the current schedule interval (period, passing, break, ...).
 * An hour when the calendar has nothing to say. Sent relative rather than
 * as an absolute time so neither client clock skew nor DEBUG_TIME can
 * garble the client's timer.
 */
export const secondsToNextSwitch = (
  instant?: Temporal.Instant,
  bells: BellSchedule = schedule,
): number => {
  try {
    const left = bells.currentInterval(instant)?.left(instant);
    if (left) {
      return Math.max(Math.ceil(left.total('seconds')), 1);
    }
  } catch {
    // Out of calendar; fall through to the retry-in-an-hour default.
  }
  return 3600;
};

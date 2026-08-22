import { BellSchedule, clearDebugTime, getDebugOffset, setDebugTime } from '@peterseibel/bells';
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
 * includeTags makes the optional periods visible so classes assigned to
 * period 0 or 7 participate in room switching.
 */
export const schedule = new BellSchedule(years, {
  role: 'student',
  includeTags: ['zero', 'seventh'],
});

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

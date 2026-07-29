import { Temporal } from '@js-temporal/polyfill';

/*
 * California-time formatting of the seconds-resolution unix timestamps we
 * get from SQLite. Temporal handles the DST boundaries that used to be
 * hardcoded here. (Keep the polyfill until Node's native Temporal is
 * unflagged.)
 */

const TIMEZONE = 'America/Los_Angeles';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const zoned = (utcSeconds: number) =>
  Temporal.Instant.fromEpochMilliseconds(utcSeconds * 1000).toZonedDateTimeISO(TIMEZONE);

/*
 * Convert a seconds-unit UTC timestamp to a California yyyy-mm-dd string.
 */
export const yyyymmdd = (utc: number): string => zoned(utc).toPlainDate().toString();

/*
 * Convert a seconds-unit UTC timestamp to a California hh:mm am/pm string.
 */
export const hhmm = (utc: number): string => {
  const d = zoned(utc);
  const hh = String(((d.hour + 11) % 12) + 1).padStart(2, '0');
  const mm = String(d.minute).padStart(2, '0');
  const ampm = d.hour >= 12 ? 'pm' : 'am';
  return `${hh}:${mm} ${ampm}`;
};

/*
 * California date in human readable form with day.
 */
export const humandate = (utc: number): string => {
  const d = zoned(utc);
  return `${DAYS[d.dayOfWeek - 1]}, ${MONTHS[d.month - 1]} ${d.day}, ${d.year}`;
};

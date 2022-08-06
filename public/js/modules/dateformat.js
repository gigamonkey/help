// Kludgy terrible quick and dirty timezone adustment that only works for this
// year. Maybe by next year Temporal will be released.

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
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// PDT ends at 2:00am 2022-11-06 (which becomes 1:00am PST) and begins again at
// 2:00am 2023-03-12 (which becomes 3:00am PDT). These are the second-resolution
// timestamps for those two points in time.
const PDT_END = 1667725200;
const PDT_BEGIN = 1678615200;

// These offsets are in seconds since that's what the timestamps from SQLite are
// in.
const HOUR = 60 * 60;
const PDT = 7 * HOUR;
const PST = 8 * HOUR;

const inPDT = (utc) => utc < PDT_END || utc >= PDT_BEGIN;

const offset = (utc) => (inPDT(utc) ? PDT : PST);

const shiftedDate = (utc) => new Date((utc - offset(utc * 1000)) * 1000);

/*
 * Convert a seconds-unit UTC timestamp to a California yyyy-mm-dd string.
 */
const yyyymmdd = (utc) => {
  const d = shiftedDate(utc);
  const yyyy = d.getUTCFullYear();
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

/*
 * Convert a seconds-unit UTC timestamp to a California hh:mm string.
 */
const hhmm = (utc) => {
  const d = shiftedDate(utc);
  const h = d.getUTCHours();
  const hh = (((h + 11) % 12) + 1).toString().padStart(2, '0');
  const mm = d.getUTCMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  return `${hh}:${mm} ${ampm}`;
};

/*
 * California date in human readable form with day.
 */
const humandate = (utc) => {
  const d = shiftedDate(utc);
  const day = DAYS[d.getUTCDay()];
  const month = MONTHS[d.getUTCMonth()];
  const date = d.getUTCDate();
  const year = d.getUTCFullYear();
  return `${day}, ${month} ${date}, ${year}`;
};
export { yyyymmdd, hhmm, humandate };

// Kludgy terrible quick and dirty timezone adustment that only works for this
// year. Maybe by next year Temporal will be released.

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

/*
 * Convert a seconds-unit UTC timestamp to a California yyyy-mm-dd string.
 */
const yyyymmdd = (utc) => {
  const d = new Date((utc - offset(utc * 1000)) * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

/*
 * Convert a seconds-unit UTC timestamp to a California hh:mm string.
 */
const hhmm = (utc) => {
  const d = new Date((utc - offset(utc * 1000)) * 1000);
  const hh = (((d.getUTCHours() + 11) % 12) + 1).toString().padStart(2, '0');
  const mm = d.getUTCMinutes().toString().padStart(2, '0');
  const ampm = hh > 12 ? 'pm' : 'am';
  return `${hh}:${mm} ${ampm}`;
};

export { yyyymmdd, hhmm };

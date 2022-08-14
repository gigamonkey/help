import { yyyymmdd, hhmm, humandate } from './dateformat.js';

const groupEntries = (data) => {
  const grouped = [];
  let current = {}; // dummy
  data.forEach((e) => {
    const { time } = e;
    const date = yyyymmdd(time);
    if (current.date !== date) {
      const nice = humandate(time);
      current = { date, nice, entries: [] };
      grouped.push(current);
    }
    current.entries.unshift({ ...e, time: hhmm(e.time) });
  });
  return grouped;
};

export default groupEntries;

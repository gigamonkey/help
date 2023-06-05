import { yyyymmdd, hhmm, humandate } from './dateformat.js';

const groupEntries = (data) => {
  const grouped = [];
  let current = {}; // dummy
  data.forEach((e) => {
    const { created_at } = e;
    const date = yyyymmdd(created_at);
    const prompted = e.prompt_id !== null;

    if (current.date !== date || current.prompted !== prompted) {
      const nice = humandate(created_at);
      current = { date, nice, prompted, entries: [] };
      grouped.push(current);
    }
    current.entries.unshift({ ...e, created_at: hhmm(e.created_at) });
  });
  return grouped;
};

export default groupEntries;

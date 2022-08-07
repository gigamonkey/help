import { $, markdown, withClass } from './modules/common.js';
import { yyyymmdd, hhmm, humandate } from './modules/dateformat.js';

const render = async () => {
  console.log('here');
  fetch(`/api${window.location.pathname}`)
    .then((r) => {
      console.log(`status: ${r.status}`);
      if (r.status === 200) {
        r.json().then((data) => $('#journal').replaceChildren(...entries(groupEntries(data))));
      } else if (r.status === 401) {
        $('#journal').replaceChildren($('<h1>', 'Not allowed to see that journal.'));
      } else {
        $('#journal').replaceChildren($('<h1>', 'No such journal.'));
      }
    })
    .catch(() => console.log('wat'));
};

const groupEntries = (data) => {
  const grouped = [];
  let current = {}; // dummy
  data.forEach((e) => {
    const { text, time } = e;
    const date = yyyymmdd(time);
    if (current.date !== date) {
      const nice = humandate(time);
      current = { date, nice, entries: [] };
      grouped.push(current);
    }
    current.entries.unshift({ time, text });
  });
  return grouped;
};

const entries = (days) => days.map((d) => oneDay(d));

const oneDay = (day) => {
  const div = withClass('day', $('<div>', $('<h2>', day.nice)));

  day.entries.forEach((e) => {
    div.append(
      withClass(
        'entry',
        $('<div>', withClass('time', $('<p>', hhmm(e.time))), withClass('text', markdown(e.text))),
      ),
    );
  });
  return div;
};

render();

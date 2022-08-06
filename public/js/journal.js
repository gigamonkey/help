/* global DOMPurify, marked */

import { $, withClass } from './modules/common.js';
import { yyyymmdd, hhmm, humandate } from './modules/dateformat.js';

const render = async () => {
  const data = await fetch('/api/journal').then((r) => r.json());
  $('#journal').replaceChildren(...entries(groupEntries(data)));
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

  const markdown = (text) => {
    const d = $('<div>');
    d.innerHTML = DOMPurify.sanitize(marked.parse(text));
    return d;
  };

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

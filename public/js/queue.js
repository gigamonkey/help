function $(s, ...rest) {
  if (typeof s === 'string') {
    if (s[0] === '#') {
      return document.getElementById(s.substring(1));
    } else if (s[0] === '<') {
      const e = document.createElement(s.substring(1, s.length - 1));
      if (rest) {
        rest.forEach((x) => e.append($(x)));
      }
      return e;
    } else {
      return document.createTextNode(s);
    }
  } else {
    return s;
  }
}

const $$ = (q) => document.querySelectorAll(q);

const withClass = (clazz, e) => {
  e.classList.add(clazz);
  return e;
};

const renderQueue = async () => {
  const q = $('#queue');
  const data = await fetch('/api/queue').then((r) => r.json());
  data.forEach((h) => {
    q.append(helpCard(h));
  });
};

const elapsed = (utcSeconds) => {
  const millis = Date.now() - utcSeconds * 1000;
  const seconds = Math.round(millis / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const mm = String(minutes % 60).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return hours ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
};

const timeElement = (time) => {
  const e = withClass('time', $('<span>', elapsed(time)));
  e.dataset.time = time;
  return e;
};

const helpCard = (h) => {
  const { who, problem, tried, time } = h;

  return withClass(
    'item',
    $(
      '<div>',
      withClass('who', $('<div>', $('<span>', who), timeElement(time))),
      withClass('problem', $('<fieldset>', $('<legend>', 'Problem'), $('<div>', problem))),
      withClass('tried', $('<fieldset>', $('<legend>', 'Tried'), $('<div>', tried))),
    ),
  );
};

const updateTimes = () => {
  $$('.time').forEach((e) => {
    e.innerText = elapsed(e.dataset.time);
  });
};

renderQueue();

setInterval(updateTimes, 1000);

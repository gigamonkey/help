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

const basicHelpCard = (h) => {
  const { id, who_name: name, who_email: email, problem, tried, time } = h;

  return withClass(
    'item',
    $(
      '<div>',
      withClass(
        'who',
        $(
          '<div>',
          $('<span>', document.createTextNode(`#${id}`), ' - ', $('<span>', name || email)),
          timeElement(time),
        ),
      ),
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

export { $, basicHelpCard, updateTimes, withClass, timeElement };

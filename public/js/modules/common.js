/* global DOMPurify, marked */

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

const markdown = (text) => {
  const d = $('<div>');
  d.innerHTML = DOMPurify.sanitize(marked.parse(text));
  return d;
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

const helpCard = (h, user, showStatus, render) => {
  const item = basicHelpCard(h);
  item.append(statusAndButtons(h, user, showStatus, render));
  return item;
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
          $(
            '<span>',
            helpLink(id, document.createTextNode(`#${id}`)),
            ' - ',
            $('<span>', name || email),
          ),
          timeElement(time),
        ),
      ),
      withClass(
        'section',
        $(
          '<div>',
          $('<h1>', 'Problem'),
          $('<div>', markdown(problem)),
          $('<h1>', 'Tried'),
          $('<div>', markdown(tried)),
        ),
      ),
    ),
  );
};

const helpLink = (id, text) => {
  const a = $('<a>', text);
  a.setAttribute('href', `/help/${id}`);
  return a;
};

const status = (h) => {
  if (h.discarded_time !== null) {
    return 'Discarded';
  } else if (h.end_time !== null) {
    return 'Done';
  } else if (h.start_time !== null) {
    return 'In progress';
  } else {
    return 'On queue';
  }
};

const updateTimes = () => {
  $$('.time').forEach((e) => {
    e.innerText = elapsed(e.dataset.time);
  });
};

const statusAndButtons = (h, user, showStatus, render) => {
  const s = status(h);
  const div = withClass('buttons', $('<div>'));
  if (showStatus) {
    div.append(withClass('status', $('<span>', `Status: ${s}`)));
  }
  if (h.helper) {
    div.append($('<span>', `Helping: ${h.helper}`));
  }
  if (!(showStatus || h.helper)) {
    div.append($('<span>'));
  }

  div.append(buttonsForStatus(s, h.id, user, render));
  return div;
};

const buttonsForStatus = (s, id, user, render) => {
  const span = $('<span>');
  if (user.role === 'teacher' || user.role === 'helper') {
    if (s !== 'In progress') {
      span.append(takeButton(id)); // doesn't need render.
    }
    if (s !== 'Done') {
      span.append(doneButton(id, render));
    }
    if (s !== 'On queue') {
      span.append(requeueButton(id, render));
    }
    if (['Done', 'Discarded'].indexOf(s) !== -1) {
      span.append(reopenButton(id, render));
    }
    if (s !== 'Discarded') {
      span.append(discardButton(id, render));
    }
  }
  return span;
};

const takeButton = (id) => {
  const b = $('<button>', 'Take');
  b.onclick = () => takeItem(id);
  return b;
};

const requeueButton = (id, after) => {
  const b = $('<button>', 'Requeue');
  b.onclick = () => requeue(id, after);
  return b;
};

const doneButton = (id, after) => {
  const b = $('<button>', 'Done');
  b.onclick = () => markDone(id, after);
  return b;
};

const reopenButton = (id, after) => {
  const b = $('<button>', 'Reopen');
  b.onclick = () => reopen(id, after);
  return b;
};

const discardButton = (id, after) => {
  const b = $('<button>', 'Discard');
  b.onclick = () => discard(id, after);
  return b;
};

const takeItem = async (id) => {
  await fetch(`/api/help/${id}/take`).then(() => {
    window.location = `/help/${id}`;
  });
};

const requeue = async (id, after) => {
  await patch(`/api/help/${id}/requeue`, {}).then(() => after());
};

const reopen = async (id, after) => {
  await patch(`/api/help/${id}/reopen`, {}).then(() => after());
};

const discard = async (id, after) => {
  await patch(`/api/help/${id}/discard`, {}).then(() => after());
};

const markDone = async (id, after) => {
  await patch(`/api/help/${id}/finish`, {}).then(() => after());
};

const patch = (url, data) =>
  fetch(url, {
    method: 'PATCH',
    body: JSON.stringify(data),
    headers: {
      'Content-type': 'application/json; charset=UTF-8',
    },
  });

const withUser = (callback) => {
  fetch('/api/user')
    .then((r) => r.json())
    .then(callback);
};

export {
  $,
  $$,
  helpCard,
  markdown,
  status,
  statusAndButtons,
  timeElement,
  updateTimes,
  withClass,
  withUser,
};

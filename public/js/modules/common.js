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

const helpCard = (h, role, render) => {
  const item = basicHelpCard(h);
  item.append(statusAndButtons(h, role, render));
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
      withClass('problem', $('<fieldset>', $('<legend>', 'Problem'), $('<div>', problem))),
      withClass('tried', $('<fieldset>', $('<legend>', 'Tried'), $('<div>', tried))),
    ),
  );
};

const helpLink = (id, text) => {
  const a = $('<a>', text);
  a.setAttribute('href', `/help/${id}`);
  return a;
};

const status = (h) => {
  if (h.end_time !== null) {
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

const statusAndButtons = (h, role, render) => {
  const s = status(h);

  const statusMarker = withClass('status', $('<span>', `Status: ${s}`));
  const buttons = buttonsForStatus(s, h.id, role, render);

  return withClass('buttons', $('<div>', statusMarker, buttons));
};

const buttonsForStatus = (s, id, role, render) => {
  const span = $('<span>');
  if (role === 'helper') {
    if (s === 'On queue') {
      span.append(takeButton(id, render));
    }
    if (s === 'In progress' || s === 'Done') {
      span.append(requeueButton(id, render));
    }
    if (s === 'In progress') {
      span.append(doneButton(id, render));
    }
    if (s === 'Done') {
      span.append(reopenButton(id, render));
    }
  }
  return span;
};

const takeButton = (id, after) => {
  const b = $('<button>', 'Take');
  b.onclick = () => takeItem(id, after);
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

const takeItem = async (id) => {
  await fetch(`/api/take/${id}`).then(() => {
    window.location = `/help/${id}`;
  });
};

const requeue = (id, after) => {
  console.log('requeue not implemented yet');
  after();
};

const reopen = (id, after) => {
  console.log('reopen not implemented yet');
  after();
};

const markDone = async (id, after) => {
  await patch(`/api/help/${id}/finish`, { comment: null }).then(() => after());
};

const patch = (url, data) =>
  fetch(url, {
    method: 'PATCH',
    body: JSON.stringify(data),
    headers: {
      'Content-type': 'application/json; charset=UTF-8',
    },
  });

export { $, helpCard, updateTimes, withClass, status, timeElement, statusAndButtons };

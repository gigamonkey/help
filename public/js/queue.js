import { $, helpCard, updateTimes } from './modules/common.js';

// FIXME: get role out side of this function
const render = async () => {
  const { role } = await fetch('/api/role').then((r) => r.json());
  const data = await fetch('/api/queue').then((r) => r.json());
  $('#queue').replaceChildren(...data.map((h) => helpCard(h, role, false, render)));
};

render();

setInterval(updateTimes, 1000);

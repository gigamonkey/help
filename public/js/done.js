import { $, helpCard, updateTimes } from './modules/common.js';

const render = async () => {
  const { role } = await fetch('/api/role').then((r) => r.json());
  const data = await fetch('/api/helped').then((r) => r.json());
  $('#items').replaceChildren(...data.map((h) => helpCard(h, role, false, render)));
};

render();

setInterval(updateTimes, 1000);

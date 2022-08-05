import { $, helpCard, updateTimes } from './modules/common.js';

const render = async () => {
  const { role } = await fetch('/api/role').then((r) => r.json());
  const data = await fetch(`/api${window.location.pathname}`).then((r) => r.json());
  $('#item').replaceChildren(helpCard(data, role, true, render));
};

render();

setInterval(updateTimes, 1000);

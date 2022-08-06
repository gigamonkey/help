import { $, helpCard, updateTimes, withUser } from './modules/common.js';

withUser((u) => {
  const { role } = u;

  const render = async () => {
    const data = await fetch('/api/queue').then((r) => r.json());
    $('#queue').replaceChildren(...data.map((h) => helpCard(h, role, false, render)));
  };

  render();
  setInterval(updateTimes, 1000);
});

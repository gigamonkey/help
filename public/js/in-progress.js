import { $, helpCard, updateTimes, withUser } from './modules/common.js';

withUser((user) => {
  const render = async () => {
    const data = await fetch('/api/in-progress').then((r) => r.json());
    $('#items').replaceChildren(...data.map((h) => helpCard(h, user, false, render)));
  };

  render();
  setInterval(updateTimes, 1000);
});

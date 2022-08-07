import { $, helpCard, updateTimes, withUser } from './modules/common.js';

withUser((user) => {
  const render = async () => {
    const data = await fetch('/api/in-progress').then((r) => r.json());
    if (data.length > 0) {
      $('#items').replaceChildren(...data.map((h) => helpCard(h, user, false, render)));
    } else {
      $('#items').replaceChildren($('<h2>', 'Nothing in progress.'));
    }
  };

  render();
  setInterval(updateTimes, 1000);
});

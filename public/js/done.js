import { $, helpCard, updateTimes, withUser } from './modules/common.js';

withUser((user) => {
  const render = async () => {
    const data = await fetch('/api/done').then((r) => r.json());
    if (data.length > 0) {
      $('#items').replaceChildren(...data.map((h) => helpCard(h, user, false, render)));
    } else {
      $('#items').replaceChildren($('<h2>', 'Nobody has been helped yet.'));
    }
  };

  render();
  setInterval(updateTimes, 1000);
});

import { $, helpCard, updateTimes, withUser } from './modules/common.js';

withUser((user) => {
  const render = async () => {
    const data = await fetch('/api/queue').then((r) => r.json());
    if (data.length > 0) {
      $('#queue').replaceChildren(...data.map((h) => helpCard(h, user, false, render)));
    } else {
      $('#queue').replaceChildren($('<h2>', '🎉 Nobody waiting! 🎉'));
    }
  };

  render();
  setInterval(updateTimes, 1000);
});

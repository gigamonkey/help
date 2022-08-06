import { $, helpCard, updateTimes, withUser } from './modules/common.js';

withUser((user) => {
  const render = async () => {
    const data = await fetch(`/api${window.location.pathname}`).then((r) => r.json());
    $('#item').replaceChildren(helpCard(data, user, true, render));
  };
  render();
  setInterval(updateTimes, 1000);
});

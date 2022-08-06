import { $, helpCard, updateTimes, withUser } from './modules/common.js';

withUser((u) => {
  const { role } = u;

  const render = async () => {
    const data = await fetch(`/api${window.location.pathname}`).then((r) => r.json());
    $('#item').replaceChildren(helpCard(data, role, true, render));
  };
  render();
  setInterval(updateTimes, 1000);
});

import { $, helpCard, updateTimes } from './modules/common.js';

const renderItem = async () => {
  const item = $('#item');
  const data = await fetch(`/api${window.location.pathname}`).then((r) => r.json());

  item.append(helpCard(data));
  // item.append($('<pre>', JSON.stringify(data, null, 2)));
};

renderItem();

setInterval(updateTimes, 1000);

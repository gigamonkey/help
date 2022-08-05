import { $, basicHelpCard, updateTimes, timeElement, withClass  } from './modules/common.js';

const renderItem = async () => {
  const item = $('#item');
  const data = await fetch(`/api${window.location.pathname}`).then((r) => r.json());

  item.append(helpCard(data));
  // item.append($('<pre>', JSON.stringify(data, null, 2)));
};

const helpCard = (h, role) => {
  //const { id, who_name: name, who_email: email, problem, tried, time } = h;

  const item = basicHelpCard(h);
  item.append(withClass('buttons', $('<div>', $('<button>', 'Re-queue'), $('<button>', 'Done'))));
  return item;
};



renderItem();

setInterval(updateTimes, 1000);

import { $, basicHelpCard, updateTimes, withClass } from './modules/common.js';

const renderItems = async () => {
  const q = $('#items');
  const { role } = await fetch('/api/role').then((r) => r.json());
  const data = await fetch('/api/in-progress').then((r) => r.json());
  data.forEach((h) => {
    q.append(helpCard(h, role));
  });
};

const helpCard = (h, role) => {
  const item = basicHelpCard(h);
  item.append(withClass('buttons', $('<div>', $('<button>', 'Re-queue'), $('<button>', 'Done'))));
  return item;
};

const takeItem = async (id) => {
  await fetch(`/api/take/${id}`).then((r) => r.json());
  window.location = `/help/${id}`;
};

renderItems();

setInterval(updateTimes, 1000);

import { $, basicHelpCard, updateTimes } from './modules/common.js';

const renderQueue = async () => {
  const q = $('#queue');
  const { role } = await fetch('/api/role').then((r) => r.json());
  const data = await fetch('/api/queue').then((r) => r.json());
  data.forEach((h) => {
    q.append(helpCard(h, role));
  });
};

const helpCard = (h, role) => {
  const item = basicHelpCard(h);
  if (role === 'helper') {
    item.ondblclick = () => takeItem(h.id);
  }
  return item;
};

const takeItem = async (id) => {
  await fetch(`/api/take/${id}`).then((r) => r.json());
  window.location = `/help/${id}`;
};

renderQueue();

setInterval(updateTimes, 1000);

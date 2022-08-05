import { $, helpCard, updateTimes } from './modules/common.js';

const renderQueue = async () => {
  const q = $('#queue');
  const { role } = await fetch('/api/role').then((r) => r.json());
  const data = await fetch('/api/queue').then((r) => r.json());
  data.forEach((h) => {
    q.append(helpCard(h, role));
  });
};

renderQueue();

setInterval(updateTimes, 1000);

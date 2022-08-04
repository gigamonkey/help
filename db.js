import DB from './modules/storage.js';

const db = new DB('help.db');

db.setup(() => {
  db.close(() => {
    console.log('All done.');
  });
});

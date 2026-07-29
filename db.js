import process from 'node:process';
import DB from './modules/storage.js';

const { DB_DIR, DB_FILE } = process.env;

const db = new DB(`${DB_DIR}/${DB_FILE}`);

db.setup(() => {
  db.close(() => {
    console.log('All done.');
  });
});

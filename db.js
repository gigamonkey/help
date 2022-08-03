import DB from './modules/storage.js';

const db = new DB('help.db');

const chunk1 = () => {
  db.db.run('BEGIN');
  db.requestHelp("peter", "nothing works", "nothing");
  db.queue();
  db.db.run('COMMIT');
};

const chunk2 = () => {
  db.db.run('BEGIN');
  db.takeTop();
  db.db.run('COMMIT');
};

const chunk3 = () => {
  db.db.run('BEGIN');
  db.queue();
  db.beingHelped();
  db.db.run('COMMIT');
};

db.setup((err) => {
  db.requestHelp("peter", "nothing works", "nothing", (err) => {
    if (err) throw err;
    db.queue((err) => {
      if (err) throw err;
      db.takeTop((err) => {
        if (err) throw err;
        db.queue((err) => {
          if (err) throw err;
          db.beingHelped(() => {
            db.close(() => {
              console.log("All done.");
            });
          });
        });
      });
    });
  })
});

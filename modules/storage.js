import sqlite3 from 'sqlite3';

const QUEUE = `
  SELECT requests.rowid as id, *
  FROM requests
  LEFT JOIN help ON requests.rowid == help.request_id
  WHERE help.request_id IS NULL ORDER BY requests.time ASC
`;

const QUEUE_TOP = `${QUEUE} LIMIT 1`;

const BEING_HELPED = `
  SELECT requests.rowid as id, requests.*, help.start_time
  FROM requests
  LEFT JOIN help ON requests.rowid = help.request_id
  WHERE help.request_id IS NOT NULL ORDER BY requests.time asc
`;

class DB {

  constructor(file) {
    this.db = new sqlite3.Database(file);
  }

  setup(andThen) {
    this.db.serialize(() => {
      this.db.run("CREATE TABLE IF NOT EXISTS requests (who TEXT, problem TEXT, tried TEXT, time INTEGER)");
      this.db.run("CREATE TABLE IF NOT EXISTS help (request_id INTEGER, start_time INTEGER, end_time INTEGER)");
      andThen();
    });
  }

  close(andThen) {
    console.log('Closing');
    this.db.close((err) => {
      if (err) throw err;
      andThen();
    });
  }

  requestHelp(who, problem, tried, andThen) {
    const stmt = this.db.prepare("INSERT INTO requests VALUES (?, ?, ?, unixepoch('now'))");
    stmt.run(who, problem, tried);
    stmt.finalize(andThen);
  }

  take(id, andThen) {
    console.log(`Taking ${id}`);
    const stmt = this.db.prepare("INSERT INTO help VALUES (?, unixepoch('now'), NULL)")
    stmt.run(id);
    stmt.finalize(andThen);
  }

  takeTop(andThen) {
    this.db.all(QUEUE_TOP, (err, rows) => {
      if (err) throw err;
      const row = rows[0];
      console.log(`TAKING TOP ${row.id}: who: ${row.who}; problem: ${row.problem}; tried: ${row.tried}; time: ${row.time}`);
      this.take(row.id, andThen);
    });
  }

  queue(andThen) {
    this.db.each(QUEUE, (err, row) => {
      if (err) {
        throw err;
      }
      console.log(`X ${row.id}: who: ${row.who}; problem: ${row.problem}; tried: ${row.tried}; time: ${row.time}`);
    }, (err, n) => {
      if (err) throw err;
      andThen();
    });
  }

  beingHelped(andThen) {
    this.db.each(BEING_HELPED, (err, row) => {
      console.log(`y ${row.id}: problem: ${row.problem}; tried: ${row.tried}; time: ${row.time}. Help started at: ${row.start_time}`);
    }, (err, n) => {
      if (err) throw err;
      andThen();
    });
  }

}

export default DB;

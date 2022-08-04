import sqlite3 from 'sqlite3';

const CREATE_HELP_TABLE = `
  CREATE TABLE IF NOT EXISTS help (
    who TEXT NOT NULL,
    problem TEXT NOT NULL,
    tried TEXT NOT NULL,
    time INTEGER NOT NULL,
    helper TEXT,
    start_time INTEGER,
    end_time INTEGER,
    comment TEXT)
`;

const REQUEST_HELP = "INSERT INTO help VALUES (?, ?, ?, unixepoch('now'), null, null, null, null)";

const GET_HELP = "SELECT rowid as id, * FROM help WHERE rowid = ?";

const START_HELP = "UPDATE help SET start_time = unixepoch('now'), helper = ? WHERE rowid = ?";

const FINISH_HELP = "UPDATE help SET end_time = unixepoch('now'), comment = ? WHERE rowid = ?";

const QUEUE = "SELECT rowid as id, * FROM help WHERE start_time IS NULL ORDER BY time ASC";

const QUEUE_TOP = `${QUEUE} LIMIT 1`;

const IN_PROGRESS = "SELECT rowid as id, * FROM help WHERE start_time IS NOT NULL AND end_time IS NULL ORDER BY time ASC";

const HELPED = "SELECT rowid as id, * FROM help WHERE end_time IS NOT NULL ORDER BY time asc";


class DB {

  constructor(file) {
    this.db = new sqlite3.Database(file);
  }

  setup() {
    this.db.serialize(() => {
      this.db.run(CREATE_HELP_TABLE);
    });
  }

  close(callback) {
    this.db.close((err) => {
      if (callback) {
        if (err) {
          callback(err, null);
        } else {
          callback(null, true);
        }
      }
    });
  }

  /*
   * Create a new request for help.
   */
  requestHelp(who, problem, tried, callback) {
    const stmt = this.db.prepare(REQUEST_HELP);
    const that = this;
    stmt.run(who, problem, tried, function (err) {
      if (err) {
        callback(err, null);
      } else {
        that.getHelp(this.lastID, callback);
      }
    });
  }

  getHelp(id, callback) {
    this.db.get(GET_HELP, id, callback);
  }

  take(id, helper, callback) {
    const stmt = this.db.prepare(START_HELP)
    stmt.run(helper, id, (err) => {
      if (err) {
        callback(err, null);
      } else {
        this.getHelp(id, callback);
      }
    });
  }

  next(helper, callback) {
    this.db.all(QUEUE_TOP, (err, rows) => {
      if (err) {
        callback(err, null);
      } else {
        const row = rows[0];
        this.take(row.id, helper, callback);
      }
    });
  }

  finishHelp(id, comment, callback) {
    this.db.run(FINISH_HELP, comment, id, (err, rows) => {
      if (err) {
        callback(err, null);
      } else {
        this.getHelp(id, callback);
      }
    });
  }

  /*
   * Get all the help requests that have not been picked up to be helped yet.
   */
  queue(callback) {
    this.db.all(QUEUE, callback);
  }

  /*
   * Get all help requests that someone has started helping but not finished.
   */
  inProgress(callback) {
    this.db.all(IN_PROGRESS, callback);
  }

  /*
   * Get all help requests that have been finish.
   */
  helped(callback) {
    this.db.all(HELPED, callback);
  }
}

export default DB;

import sqlite3 from 'sqlite3';

const CREATE_REQUESTS_TABLE = `
  CREATE TABLE IF NOT EXISTS requests (
    who TEXT NOT NULL,
    problem TEXT NOT NULL,
    tried TEXT NOT NULL,
    time INTEGER NOT NULL)
`;

const CREATE_HELP_TABLE = `
  CREATE TABLE IF NOT EXISTS help (
    request_id INTEGER NOT NULL,
    helper TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER,
    comment TEXT)
`;

const GET_REQUEST = `SELECT rowid as id, * FROM requests WHERE rowid = ?`;

const GET_HELP = `
  SELECT help.rowid as id, help.*, requests.*
  FROM help
  JOIN requests on help.request_id = requests.rowid
  WHERE id = ?
`;

const FINISH_HELP = `UPDATE help SET end_time = unixepoch('now'), comment = ? WHERE rowid = ?`;

const QUEUE = `
  SELECT requests.rowid as id, requests.*
  FROM requests
  LEFT JOIN help ON requests.rowid == help.request_id
  WHERE help.request_id IS NULL ORDER BY requests.time ASC
`;

const QUEUE_TOP = `${QUEUE} LIMIT 1`;

const BEING_HELPED = `
  SELECT requests.rowid as id, requests.*, help.*
  FROM requests
  LEFT JOIN help ON requests.rowid = help.request_id
  WHERE help.request_id IS NOT NULL
  AND help.end_time IS NULL
  ORDER BY requests.time asc
`;

const HELPED = `
  SELECT requests.rowid as id, requests.*, help.*
  FROM requests
  LEFT JOIN help ON requests.rowid = help.request_id
  WHERE help.request_id IS NOT NULL
  AND help.end_time IS NOT NULL
  ORDER BY requests.time asc
`;


class DB {

  constructor(file) {
    this.db = new sqlite3.Database(file);
  }

  setup() {
    this.db.serialize(() => {
      this.db.run(CREATE_REQUESTS_TABLE);
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

  getRequest(id, callback) {
    this.db.get(GET_REQUEST, id, callback);
  }

  getHelp(id, callback) {
    this.db.get(GET_HELP, id, callback);
  }

  /*
   * Create a new request for help.
   */
  requestHelp(who, problem, tried, callback) {
    const stmt = this.db.prepare("INSERT INTO requests VALUES (?, ?, ?, unixepoch('now'))");
    stmt.run(who, problem, tried, function (err) {
      if (err) {
        callback(err, null);
      } else {
        callback(null, this.lastID);
      }
    });
  }

  take(id, callback) {
    const stmt = this.db.prepare("INSERT INTO help VALUES (?, unixepoch('now'), NULL)")
    stmt.run(id, function (err) {
      if (err) {
        callback(err, null);
      } else {
        callback(null, this.lastID);
      }
    });
  }

  next(callback) {
    this.db.all(QUEUE_TOP, (err, rows) => {
      if (err) {
        callback(err, null);
      } else {
        const row = rows[0];
        this.take(row.id, callback);
      }
    });
  }

  finishHelp(id, comment, callback) {
    this.db.run(FINISH_HELP, comment, id, callback);
  }

  /*
   * Get all the requests that have not been picked up to be helped yet.
   */
  queue(callback) {
    this.db.all(QUEUE, callback);
  }

  /*
   * Get the combined request and help record for all requests that someone has
   * started helping but not finished.
   */
  beingHelped(callback) {
    this.db.all(BEING_HELPED, callback);
  }

  /*
   * Get the combined request and help record for all requests that have been
   * helped and finished.
   */
  helped(callback) {
    this.db.all(HELPED, callback);
  }

}

export default DB;

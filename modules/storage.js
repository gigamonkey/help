import sqlite3 from 'sqlite3';

const CREATE_HELP_TABLE = `
  CREATE TABLE IF NOT EXISTS help (
    who_email TEXT NOT NULL,
    who_name TEXT,
    problem TEXT NOT NULL,
    tried TEXT NOT NULL,
    time INTEGER NOT NULL,
    helper TEXT,
    start_time INTEGER,
    end_time INTEGER,
    comment TEXT
  )
`;

/*
 * Link the session_id we set on the browser to their OAuth state so we can
 * check it when they get redirected back. When they finish the OAuth dance and
 * we get the user info from Google we set the user field (to their email).
 */
const CREATE_SESSIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    state TEXT NOT NULL,
    user TEXT
)`;

const REQUEST_HELP =
  "INSERT INTO help VALUES (?, ?, ?, ?, unixepoch('now'), null, null, null, null)";

const GET_HELP = 'SELECT rowid as id, * FROM help WHERE rowid = ?';

const START_HELP = "UPDATE help SET start_time = unixepoch('now'), helper = ? WHERE rowid = ?";

const FINISH_HELP = "UPDATE help SET end_time = unixepoch('now'), comment = ? WHERE rowid = ?";

const QUEUE = 'SELECT rowid as id, * FROM help WHERE start_time IS NULL ORDER BY time ASC';

const QUEUE_TOP = `${QUEUE} LIMIT 1`;

const IN_PROGRESS =
  'SELECT rowid as id, * FROM help WHERE start_time IS NOT NULL AND end_time IS NULL ORDER BY time ASC';

const HELPED = 'SELECT rowid as id, * FROM help WHERE end_time IS NOT NULL ORDER BY time asc';

const GET_SESSION = 'SELECT rowid as id, * FROM sessions WHERE session_id = ?';

const MAKE_SESSION = "INSERT INTO sessions VALUES (?, unixepoch('now'), unixepoch('now'), ?, null)";

const SET_SESSION_USER = 'UPDATE sessions SET user = ? where session_id = ?';

class DB {
  constructor(file) {
    this.db = new sqlite3.Database(file);
  }

  setup() {
    this.db.serialize(() => {
      this.db.run(CREATE_HELP_TABLE);
      this.db.run(CREATE_SESSIONS_TABLE);
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
  requestHelp(email, name, problem, tried, callback) {
    const stmt = this.db.prepare(REQUEST_HELP);
    const that = this;
    stmt.run(email, name, problem, tried, function (err) {
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
    const stmt = this.db.prepare(START_HELP);
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
        const [row] = rows;
        this.take(row.id, helper, callback);
      }
    });
  }

  finishHelp(id, comment, callback) {
    this.db.run(FINISH_HELP, comment, id, (err) => {
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

  newSession(sessionID, state, callback) {
    this.db.run(MAKE_SESSION, sessionID, state, callback);
  }

  getSession(sessionID, callback) {
    this.db.get(GET_SESSION, sessionID, callback);
  }

  setSessionUser(sessionID, user, callback) {
    this.db.run(SET_SESSION_USER, user, sessionID, callback);
  }
}

export default DB;

import sqlite3 from 'sqlite3';

/*
 * Help items.
 */
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
 * Student journals.
 */
const CREATE_JOURNAL_TABLE = `
  CREATE TABLE IF NOT EXISTS journal (
    author_email TEXT NOT NULL,
    author_name TEXT,
    text TEXT NOT NULL,
    date TEXT NOT NULL,
    time INTEGER
  )
`;

/*
 * In flight OAuth sessions. We store the state so we can compare it to what
 * gets passed back to the /auth endpoint. created_at is here so we can clean up
 * any old sessions that don't get cleaned up after the auth finishes. Nothing
 * does that automatically yet though.
 */
const CREATE_SESSIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    state TEXT NOT NULL
)`;

const CREATE_USERS_TABLE = `
  CREATE TABLE IF NOT EXISTS users (
    email TEXT NOT NULL,
    name INTEGER NOT NULL,
    role TEXT
)`;

const REQUEST_HELP =
  "INSERT INTO help VALUES (?, ?, ?, ?, unixepoch('now'), null, null, null, null)";

const GET_HELP = 'SELECT rowid as id, * FROM help WHERE rowid = ?';

const START_HELP = "UPDATE help SET start_time = unixepoch('now'), helper = ? WHERE rowid = ?";

const FINISH_HELP = "UPDATE help SET end_time = unixepoch('now'), comment = ? WHERE rowid = ?";

const REQUEUE_HELP =
  'UPDATE help SET start_time = null, end_time = null, helper = null, comment = null WHERE rowid = ?';

const REOPEN_HELP = 'UPDATE help SET end_time = null, comment = null WHERE rowid = ?';

const QUEUE = 'SELECT rowid as id, * FROM help WHERE start_time IS NULL ORDER BY time ASC';

const QUEUE_TOP = `${QUEUE} LIMIT 1`;

const IN_PROGRESS =
  'SELECT rowid as id, * FROM help WHERE start_time IS NOT NULL AND end_time IS NULL ORDER BY time ASC';

const DONE = 'SELECT rowid as id, * FROM help WHERE end_time IS NOT NULL ORDER BY time asc';

const MAKE_JOURNAL =
  "INSERT INTO journal (author_email, author_name, text, date, time) VALUES (?, ?, ?, date('now', 'localtime'), unixepoch('now'))";

const JOURNAL_FOR = 'SELECT rowid as id, * FROM journal WHERE author_email = ? ORDER BY time DESC';

class DB {
  constructor(file) {
    this.db = new sqlite3.Database(file);
  }

  setup() {
    this.db.serialize(() => {
      this.db.run(CREATE_HELP_TABLE);
      this.db.run(CREATE_SESSIONS_TABLE);
      this.db.run(CREATE_JOURNAL_TABLE);
      this.db.run(CREATE_USERS_TABLE);
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

  requeueHelp(id, callback) {
    this.db.run(REQUEUE_HELP, id, (err) => {
      if (err) {
        callback(err, null);
      } else {
        this.getHelp(id, callback);
      }
    });
  }

  reopenHelp(id, callback) {
    this.db.run(REOPEN_HELP, id, (err) => {
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
   * Get all help requests that have been finished.
   */
  done(callback) {
    this.db.all(DONE, callback);
  }

  newSession(id, state, callback) {
    const q =
      "INSERT INTO sessions (session_id, created_at, state) VALUES (?, unixepoch('now'), ?)";
    this.db.run(q, id, state, callback);
  }

  getSession(id, callback) {
    this.db.get('SELECT rowid as id, * FROM sessions WHERE session_id = ?', id, callback);
  }

  deleteSession(id, callback) {
    this.db.run('DELETE from sessions where session_id = ?', id, callback);
  }

  addJournalEntry(email, name, text, callback) {
    this.db.run(MAKE_JOURNAL, email, name, text, callback);
  }

  journalFor(email, callback) {
    this.db.all(JOURNAL_FOR, email, callback);
  }

  user(email, callback) {
    this.db.get('SELECT rowid as id, * from users where email = ?', email, callback);
  }
}

export default DB;

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
    discarded_time INTEGER
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

const QUEUE =
  'SELECT rowid as id, * FROM help WHERE start_time IS NULL AND discarded_time IS NULL ORDER BY time ASC';

const QUEUE_TOP = `${QUEUE} LIMIT 1`;

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
    const q = `
      INSERT INTO help (who_email, who_name, problem, tried, time)
      VALUES (?, ?, ?, ?, unixepoch('now'))
    `;

    const that = this;

    this.db.run(q, email, name, problem, tried, function (err) {
      if (err) {
        callback(err, null);
      } else {
        that.getHelp(this.lastID, callback);
      }
    });
  }

  getHelp(id, callback) {
    this.db.get('SELECT rowid as id, * FROM help WHERE rowid = ?', id, callback);
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

  updateHelp(id, q, params, callback) {
    this.db.run(q, ...params, id, (err) => {
      if (err) {
        callback(err, null);
      } else {
        this.getHelp(id, callback);
      }
    });
  }

  take(id, helper, callback) {
    const q = `
      UPDATE help SET
        start_time = unixepoch('now'),
        end_time = null,
        discarded_time = null,
        helper = ?
      WHERE rowid = ?
    `;
    this.updateHelp(id, q, [helper], callback);
  }

  finishHelp(id, callback) {
    const q = `
      UPDATE help SET
        end_time = unixepoch('now'),
        discarded_time = null
      WHERE rowid = ?
    `;
    this.updateHelp(id, q, [], callback);
  }

  requeueHelp(id, callback) {
    const q = `
      UPDATE help SET
        start_time = null,
        end_time = null,
        discarded_time = null,
        helper = null
      WHERE rowid = ?
     `;
    this.updateHelp(id, q, [], callback);
  }

  reopenHelp(id, callback) {
    const q = `
      UPDATE help SET
        end_time = null,
        discarded_time = null
      WHERE rowid = ?
    `;
    this.updateHelp(id, q, [], callback);
  }

  discardHelp(id, callback) {
    const q = `
      UPDATE help SET
        discarded_time = unixepoch('now')
      WHERE rowid = ?
    `;
    this.updateHelp(id, q, [], callback);
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
    const q = `
      SELECT rowid as id, * FROM help
      WHERE start_time IS NOT NULL AND end_time IS NULL and discarded_time IS NULL ORDER BY time ASC
    `;
    this.db.all(q, callback);
  }

  /*
   * Get all help requests that have been finished.
   */
  done(callback) {
    const q =
      'SELECT rowid as id, * FROM help WHERE end_time IS NOT NULL and discarded_time IS NULL ORDER BY time ASC';
    this.db.all(q, callback);
  }

  discarded(callback) {
    const q = 'SELECT rowid as id, * FROM help WHERE discarded_time IS NOT NULL ORDER BY time ASC';
    this.db.all(q, callback);
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
    const q = `
      INSERT INTO journal
        (author_email, author_name, text, date, time)
      VALUES
        (?, ?, ?, date('now', 'localtime'), unixepoch('now'))
    `;
    this.db.run(q, email, name, text, callback);
  }

  journalFor(email, callback) {
    const q = 'SELECT rowid as id, * FROM journal WHERE author_email = ? ORDER BY time DESC';
    this.db.all(q, email, callback);
  }

  user(email, callback) {
    this.db.get('SELECT rowid as id, * from users where email = ?', email, callback);
  }

  userById(id, callback) {
    this.db.get('SELECT rowid as id, * from users where id = ?', id, callback);
  }

  ensureUser(email, name, callback) {
    this.user(email, (err, data) => {
      if (err) {
        callback(err, null);
      } else if (data) {
        callback(null, data);
      } else {
        this.db.run('INSERT INTO users (email, name) VALUES (?, ?)', email, name, callback);
      }
    });
  }
}

export default DB;

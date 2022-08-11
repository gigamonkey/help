import sqlite3 from 'sqlite3';

/*
 * Help items.
 */
const CREATE_HELP_TABLE = `
  CREATE TABLE IF NOT EXISTS help (
      email TEXT NOT NULL,
      name TEXT,
      problem TEXT NOT NULL,
      tried TEXT NOT NULL,
      time INTEGER NOT NULL,
      helper TEXT,
      start_time INTEGER,
      end_time INTEGER,
      discard_time integer
  )
`;

/*
 * Student journals.
 */
const CREATE_JOURNAL_TABLE = `
  CREATE TABLE IF NOT EXISTS journal (
      email TEXT NOT NULL,
      name TEXT,
      text TEXT NOT NULL,
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
  )
`;

const CREATE_USERS_TABLE = `
  CREATE TABLE IF NOT EXISTS users (
      email TEXT NOT NULL,
      name INTEGER NOT NULL,
      role TEXT
  )
`;

const QUEUE =
  'SELECT rowid as id, * FROM help WHERE start_time IS NULL AND discard_time IS NULL ORDER BY time ASC';

const QUEUE_TOP = `${QUEUE} LIMIT 1`;

class DB {
  constructor(file) {
    this.db = new sqlite3.Database(file);
  }

  /*
   * This needs to be kept idempotent since it is run at every server startup.
   */
  setup(after) {
    this.db.serialize(() => {
      this.db.run(CREATE_HELP_TABLE);
      this.db.run(CREATE_SESSIONS_TABLE);
      this.db.run(CREATE_JOURNAL_TABLE);
      this.db.run(CREATE_USERS_TABLE, () => after());
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
      INSERT INTO help (email, name, problem, tried, time)
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
        discard_time = null,
        helper = ?
      WHERE rowid = ?
    `;
    this.updateHelp(id, q, [helper], callback);
  }

  finishHelp(id, callback) {
    const q = `
      UPDATE help SET
        end_time = unixepoch('now'),
        discard_time = null
      WHERE rowid = ?
    `;
    this.updateHelp(id, q, [], callback);
  }

  requeueHelp(id, callback) {
    const q = `
      UPDATE help SET
        start_time = null,
        end_time = null,
        discard_time = null,
        helper = null
      WHERE rowid = ?
     `;
    this.updateHelp(id, q, [], callback);
  }

  reopenHelp(id, callback) {
    const q = `
      UPDATE help SET
        end_time = null,
        discard_time = null
      WHERE rowid = ?
    `;
    this.updateHelp(id, q, [], callback);
  }

  discardHelp(id, callback) {
    const q = `
      UPDATE help SET
        discard_time = unixepoch('now')
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
      WHERE start_time IS NOT NULL AND end_time IS NULL and discard_time IS NULL ORDER BY time ASC
    `;
    this.db.all(q, callback);
  }

  /*
   * Get all help requests that have been finished.
   */
  done(callback) {
    const q =
      'SELECT rowid as id, * FROM help WHERE end_time IS NOT NULL and discard_time IS NULL ORDER BY time ASC';
    this.db.all(q, callback);
  }

  discarded(callback) {
    const q = 'SELECT rowid as id, * FROM help WHERE discard_time IS NOT NULL ORDER BY time ASC';
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
        (email, name, text, time)
      VALUES
        (?, ?, ?, unixepoch('now'))
    `;
    this.db.run(q, email, name, text, callback);
  }

  journalFor(email, callback) {
    const q = 'SELECT rowid as id, * FROM journal WHERE email = ? ORDER BY time DESC';
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
        this.db.run('INSERT INTO users (email, name) VALUES (?, ?)', email, name, (err) => {
          if (err) {
            callback(err, null);
          } else {
            this.user(email, callback);
          }
        });
      }
    });
  }

  userStats(callback) {
    // N.B. the journal_days is unfortunately tied to UTC days. But fixing it
    // properly probably requires doing the counting outside the database.
    const q = `
      select
        users.rowid as id,
        users.*,
        count(distinct journal.rowid) as journal_entries,
        count(distinct date(journal.time, 'unixepoch')) as journal_days,
        count(distinct help.rowid) as help_requests
      from users
      left join journal on users.email = journal.email
      left join help on users.email = help.email
      group by users.email
      order by users.name asc;
    `;
    this.db.all(q, callback);
  }

  journalsBetween(after, before, callback) {
    const base = 'select rowid as id, * from journal';

    if (after && before) {
      const q =  `${base} where ? < time and time < ?`;
      this.db.all(q, after, before, callback);
    } else if (after) {
      const q =  `${base} where ? < time`;
      this.db.all(q, after, callback);
    } else if (before) {
      const q =  `${base} where time < ?`;
      this.db.all(q, before, callback);
    } else {
      this.db.all(base, callback);
    }
  }
}

export default DB;

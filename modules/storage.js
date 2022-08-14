import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import * as url from 'url';

import { shortRandomString } from './crypto.js';

const DIRNAME = url.fileURLToPath(new URL('.', import.meta.url));

const DDL = fs.readFileSync(path.resolve(DIRNAME, 'schema.sql'), 'utf-8');

const QUEUE =
  'SELECT rowid as id, * FROM help WHERE start_time IS NULL AND discard_time IS NULL ORDER BY time ASC';

const QUEUE_TOP = `${QUEUE} LIMIT 1`;

class DB {
  constructor(file) {
    this.db = new sqlite3.Database(file);
  }

  /*
   * DDL needs to be kept idempotent since it is run at every server startup.
   */
  setup(after) {
    this.db.serialize(() => {
      this.db.exec(DDL);
      after();
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

  createClass(classId, name, googleId, callback) {
    console.log('Creating class');
    const q = 'insert into classes (id, name, google_id) values (?, ?, ?)';
    this.db.run(q, classId, name, googleId, callback);
  }

  loadClass(classId, teacherEmail, name, googleId, students, callback) {
    const createClass = 'insert into classes (id, name, google_id) values (?, ?, ?)';
    const createMember = 'insert into class_members (email, class_id, role) values (?, ?, ?)';
    const ensureUser = 'insert or ignore into users (email, name, google_name) VALUES (?, ?, ?)';


    this.db.serialize(() => {
      this.db.run("begin transaction");
      this.db.run(createClass, classId, name, googleId);
      this.db.run(createMember, teacherEmail, classId, 'teacher');

      for (let s of students) {
        console.log(s);
        if (!s.profile.emailAddress) {
          console.log(`No address in ${JSON.stringify(s)}`);
        } else {
          this.db.run(ensureUser, s.profile.emailAddress, s.profile.name.fullName, s.profile.name.fullName);
          this.db.run(createMember, s.profile.emailAddress, classId, 'student');
        }
      }
      this.db.run("commit");
      callback(null, true);
    });
  }

  classMemberships(email, callback) {
    console.log(`Looking for memberships for ${email}`);
    this.db.all('select * from class_members join classes where class_members.class_id = classes.id and email = ?', email, callback);
  }

  getClass(id, callback) {
    this.db.get('select * from classes where id = ?', id, callback);
  }

  googleClassroomIds(callback) {
    this.db.all('select google_id from classes where google_id is not null', callback);
  }

  classByGoogleId(googleId, callback) {
    this.db.get('select * from classes where google_id = ?', googleId, callback);
  }

  joinCode(id, callback) {
    this.db.get('select joinCode from classes where id = ?', id, callback);
  }

  joinClass(id, email, callback) {
    this.db.run(
      "insert into class_members (email, class_id, role) values (?, ?, 'student')",
      email,
      id,
      callback,
    );
  }

  /*
   * Create a new request for help.
   */
  requestHelp(email, class_id, problem, tried, callback) {
    const q = `
      INSERT INTO help (email, class_id, problem, tried, time)
      VALUES (?, ?, ?, ?, unixepoch('now'))
    `;

    const that = this;

    this.db.run(q, email, class_id, problem, tried, function (err) {
      if (err) {
        callback(err, null);
      } else {
        console.log(`Created help with id ${this.lastID}`);
        that.getHelp(this.lastID, callback);
      }
    });
  }

  getHelp(id, callback) {
    console.log(`Getting help ${id}`);
    this.db.get('select rowid as id, * from help where rowid = ?', id, (err, data) => {
      console.log(`In callback for help ${id}`);
      callback(err, data);
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
  queue(classId, callback) {
    const q = `
      select rowid as id, * from help
      where class_id = ? and
      start_time is null and
      discard_time is null
      order by time asc
    `;
    this.db.all(q, classId, callback);
  }

  /*
   * Get all help requests that someone has started helping but not finished.
   */
  inProgress(classId, callback) {
    const q = `
      select rowid as id, * from help
      where class_id = ? and
      start_time is not null and
      end_time is null and
      discard_time is null
      order by time asc
    `;
    this.db.all(q, classId, callback);
  }

  /*
   * Get all help requests that have been finished.
   */
  done(classId, callback) {
    const q = `
      select rowid as id, * from help
      where class_id = ? and
      end_time is not null and
      discard_time is null
      order by time asc
    `;
    this.db.all(q, classId, callback);
  }

  discarded(classId, callback) {
    const q = `
      select rowid as id, * from help
      where class_id = ? and
      discard_time is not null
      order by time asc
    `;
    this.db.all(q, classId, callback);
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

  addJournalEntry(email, classId, text, promptId, callback) {
    const q = `
      insert into journal
        (email, class_id, text, time, prompt_id)
      values
        (?, ?, ?, unixepoch('now'), ?)
    `;
    this.db.run(q, email, classId, text, promptId, callback);
  }

  journalFor(email, classId, callback) {
    console.log(`Looking for jounal for ${email} and ${classId}`);
    const q =
      'select rowid as id, * from journal where email = ? and class_id = ? order by time desc';
    this.db.all(q, email, classId, (err, data) => {
      console.log('journal');
      console.log(data);
      callback(err, data);
    });
  }

  user(email, callback) {
    this.db.get('SELECT rowid as id, * from users where email = ?', email, callback);
  }

  classMember(email, classId, callback) {
    const q = `
      select u.rowid as id, u.*, m.role
      from users as u join class_members as m using (email)
      where u.email = ? and class_id = ?
    `;
    console.log(`Looking for classMember with ${email} and ${classId}`);
    this.db.get(q, email, classId, callback);
  }

  userById(id, callback) {
    console.log(id);
    this.db.get('SELECT rowid as id, * from users where rowid = ?', id, callback);
  }

  ensureUser(email, name, callback) {
    this.user(email, (err, data) => {
      if (err) {
        callback(err, null);
      } else if (data) {
        callback(null, data);
      } else {
        // We create a user with the name we got from Google in both name fields
        // but later we may change `name` to be the student's preferred name.
        this.db.run(
          'INSERT INTO users (email, name, google_name) VALUES (?, ?, ?)',
          email,
          name,
          name,
          (err) => {
            if (err) {
              callback(err, null);
            } else {
              this.user(email, callback);
            }
          },
        );
      }
    });
  }

  setPreferredName(email, name) {
    return this.db.run('update users set name = ? where email = ?', name, email);
  }

  userStats(classId, callback) {
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

  studentStats(classId, callback) {
    // N.B. the journal_days is unfortunately tied to UTC days. But fixing it
    // properly probably requires doing the counting outside the database.
    const q = `
      select
        m.rowid as id,
        m.*,
        u.name,
        count(distinct journal.rowid) as journal_entries,
        count(distinct date(journal.time, 'unixepoch')) as journal_days,
        count(distinct help.rowid) as help_requests
      from class_members as m
      left join journal using (email, class_id)
      left join help using (email, class_id)
      left join users as u using (email)
      where
        m.role = 'student' and
        m.class_id = ?
      group by m.email
      order by u.name asc;
    `;
    this.db.all(q, classId, callback);
  }

  journalsBetween(after, before, callback) {
    const base = 'select rowid as id, * from journal';

    if (after && before) {
      const q = `${base} where ? < time and time < ?`;
      this.db.all(q, after, before, callback);
    } else if (after) {
      const q = `${base} where ? < time`;
      this.db.all(q, after, callback);
    } else if (before) {
      const q = `${base} where time < ?`;
      this.db.all(q, before, callback);
    } else {
      this.db.all(base, callback);
    }
  }

  //////////////////////////////////////////////////////////////////////////////
  // Journal prompts

  // "select prompts.rowid as prompt_id, prompts.date, prompt_texts.prompt from prompts join prompt_texts on prompts.prompt_text_id = prompt_texts.rowid where prompts.date < unixepoch('now')"

  promptText(text, callback) {
    this.db.get('select rowid as id, * from prompt_texts where text = ?', callback);
  }

  makePromptText(title, text, callback) {
    const q = 'insert into prompt_texts (title, text) values (?, ?)';
    this.db.run(q, title, text, callback);
  }

  promptTexts(callback) {
    this.db.all('select rowid as id, * from prompt_texts', callback);
  }

  ensurePromptText(title, text, callback) {
    this.promptText(text, (err, data) => {
      if (err) {
        callback(err, null);
      } else if (data) {
        callback(null, data);
      } else {
        this.makePromptText(title, text, (err) => {
          if (err) {
            callback(err, null);
          } else {
            this.promptText(text, callback);
          }
        });
      }
    });
  }

  /*
   * Create a prompt to be displayed after date.
   */
  createPrompt(promptTextId, date, callback) {
    const q = 'insert into prompts (prompt_text_id, date) values (?, ?)';
    this.db.run(q, promptTextId, date, callback);
  }

  prompt(id, callback) {
    this.db.get('select rowid as id, * from prompts where rowid = ?', id, callback);
  }

  allPrompts(callback) {
    const q = `
      select
        prompt_texts.rowid as id,
        prompt_texts.title,
        count(prompts.rowid) as timesUsed,
        max(prompts.opened_at) as lastUsed,
        max(prompts.opened_at) > max(prompts.closed_at) as open
      from prompt_texts
      left join prompts on prompt_texts.rowid = prompts.prompt_text_id
      group by prompt_texts.rowid
   `;
    this.db.all(q, callback);
  }

  openPrompt(id, callback) {
    const q = `update prompts set closed_at = unixepoch('now') where id = ?`;
    this.db.run(q, (err) => {
      if (err) {
        callback(err, null);
      } else {
        this.prompt(id, callback);
      }
    });
  }
}

export default DB;

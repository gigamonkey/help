import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import * as url from 'url';

const DIRNAME = url.fileURLToPath(new URL('.', import.meta.url));

const DDL = fs.readFileSync(path.resolve(DIRNAME, 'schema.sql'), 'utf-8');

const ADMINS = {
  'edwardchang@berkeley.net': true,
  'mattalbinson@berkeley.net': true,
  'peterseibel@berkeley.net': true,
  'shoshanaokeefe@berkeley.net': true,
};

const OTHER_NAMES = {
  'edwardchang@berkeley.net': 'Mr. Chang',
  'mattalbinson@berkeley.net': 'Mr. Albinson',
  'peterseibel@berkeley.net': 'Mr. Seibel',
  'shoshanaokeefe@berkeley.net': 'Ms. O’Keefe',
};

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

  createClass(classId, teacherEmail, name, googleId, students, callback) {
    const createClass = 'insert into classes (id, name, google_id) values (?, ?, ?)';
    const createMember = 'insert into class_members (user_id, class_id, role) values (?, ?, ?)';
    const ensureUser = 'insert or ignore into users (id, email, name, google_name) VALUES (?, ?, ?, ?)';

    this.db.serialize(() => {
      this.db.run('begin transaction');
      this.db.run(createClass, classId, name, googleId);
      this.db.run(createMember, teacherEmail, classId, 'teacher'); // FIXME should be teacher id

      /* eslint-disable no-restricted-syntax */
      for (const s of students) {
        this.db.run(
          ensureUser,
          s.profile.id,
          s.profile.emailAddress,
          s.profile.name.fullName,
          s.profile.name.fullName,
        );
        this.db.run(createMember, s.profile.id, classId, 'student');
      }
      /* eslint-enable */
      this.db.run('commit', callback);
    });
  }

  resyncClass(classId, students, callback) {
    const currentStudentIds = `select user_id from class_members where role = 'student' and class_id = ?`;
    const ensureStudent =
          'insert or ignore into users (id, email, name, google_name, is_admin) VALUES (?, ?, ?, ?, 0)';
    const ensureMember =
      'insert or ignore into class_members (user_id, class_id, role) values (?, ?, ?)';
    const removeMember = 'delete from class_members where user_id = ?';

    this.db.all(currentStudentIds, classId, (err, data) => {
      const current = data.map((d) => d.user_id);
      const toKeep = new Set(students.map((s) => s.profile.id));

      this.db.serialize(() => {
        this.db.run('begin transaction');

        /* eslint-disable no-restricted-syntax */
        for (const s of students) {
          this.db.run(
            ensureStudent,
            s.profile.id,
            s.profile.emailAddress,
            s.profile.name.fullName,
            s.profile.name.fullName,
          );
          this.db.run(ensureMember, s.profile.id, classId, 'student');
        }

        for (const c of current) {
          if (!toKeep.has(c)) {
            this.db.run(removeMember, c);
          }
        }
        /* eslint-enable */

        this.db.run('commit', callback);
      });
    });
  }

  classMemberships(id, callback) {
    console.log(`Looking for memberships for ${id}`);
    this.db.all(
      'select * from class_members join classes where class_members.class_id = classes.id and user_id = ?',
      id,
      callback,
    );
  }

  getClassName(classId, callback) {
    this.db.get('select name from classes where id = ?', classId, callback);
  }

  getClass(id, userId, callback) {
    const q = `
      select classes.*, class_id, role from classes
      join class_members where id = class_id and
      id = ? and user_id = ?
    `;
    this.db.get(q, id, userId, callback);
  }

  googleClassroomIds(callback) {
    this.db.all('select google_id from classes where google_id is not null', callback);
  }

  classByGoogleId(googleId, callback) {
    this.db.get('select * from classes where google_id = ?', googleId, callback);
  }

  joinClass(id, userId, callback) {
    this.db.run(
      "insert into class_members (user_id, class_id, role) values (?, ?, 'student')",
      userId,
      id,
      callback,
    );
  }

  /*
   * Create a new request for help.
   */
  requestHelp(user_id, class_id, problem, callback) {
    const q = `
      INSERT INTO help (user_id, class_id, problem, created_at)
      VALUES (?, ?, ?, unixepoch('now'))
    `;

    // Can't use arrow function because we need to access this.lastID
    const that = this;

    this.db.run(q, user_id, class_id, problem, function (err) {
      if (err) {
        callback(err, null);
      } else {
        that.getHelp(this.lastID, callback);
      }
    });
  }

  getHelp(id, callback) {
    this.db.get(
      'select help.rowid as id, help.*, users.name from help join users on users.id = help.user_id where help.rowid = ?',
      id,
      (err, data) => {
        callback(err, data);
      },
    );
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

  finishHelp(id, callback) {
    const q = `UPDATE help SET closed_at = unixepoch('now') WHERE rowid = ?`;
    this.updateHelp(id, q, [], callback);
  }

  reopenHelp(id, callback) {
    const q = `UPDATE help SET closed_at = null WHERE rowid = ?`;
    this.updateHelp(id, q, [], callback);
  }

  /*
   * Get all the open help requests for the class.
   */
  queue(classId, callback) {
    const q = `
      select help.rowid as id, help.*, users.name
      from help
      join users on users.id = help.user_id
      where class_id = ? and
      closed_at is null
      order by created_at asc
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
      closed_at is not null
      order by created_at asc
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


  user(id, callback) {
    this.db.get('SELECT rowid as id, * from users where id = ?', id, callback);
  }

  classMember(id, classId, callback) {
    const q = `
      select u.*, m.role
      from users as u join class_members as m on u.id = m.user_id
      where u.id = ? and class_id = ?
    `;
    console.log(`Looking for classMember with id ${id} and ${classId}`);
    this.db.get(q, id, classId, callback);
  }

  userById(id, callback) {
    this.db.get('SELECT rowid as id, * from users where rowid = ?', id, callback);
  }

  ensureUser(id, email, googleName, callback) {
    this.user(id, (err, data) => {
      if (err) {
        callback(err, null);
      } else if (data) {
        callback(null, data);
      } else {

        console.log(`Creating user for id ${id} and email ${email}`);
        // We create a user with the name we got from Google in both name fields
        // but later we may change `name` to be the student's preferred name.
        const isAdmin = ADMINS[email] ? 1 : 0;
        const name = OTHER_NAMES[email] ?? googleName;
        const q =
              'insert or ignore into users (id, email, name, google_name, is_admin) values (?, ?, ?, ?, ?)';
        this.db.run(q, id, email, name, googleName, isAdmin, (err) => {
          if (err) {
            console.log('here', err);
            callback(err, null);
          } else {
            this.user(id, callback);
          }
        });
      }
    });
  }

  setPreferredName(user_id, name) {
    return this.db.run('update users set name = ? where user_id = ?', name, user_id);
  }

  studentStats(classId, callback) {
    const q = `
      select
        u.rowid as id,
        m.*,
        u.name,
        count(distinct help.rowid) as help_requests
      from class_members as m
      left join help using (user_id, class_id)
      left join users as u on u.id = m.user_id
      where
        m.role = 'student' and
        m.class_id = ?
      group by m.user_id
      order by u.name asc;
    `;
    this.db.all(q, classId, callback);
  }

  memberStats(classId, callback) {
    const q = `
      select
        u.rowid as id,
        m.*,
        u.name,
        count(distinct help.rowid) as help_requests
      from class_members as m
      left join help using (user_id, class_id)
      left join users as u on u.id = m.user_id
      where
        m.class_id = ?
      group by m.user_id
      order by u.name asc;
    `;
    this.db.all(q, classId, callback);
  }


}

export default DB;

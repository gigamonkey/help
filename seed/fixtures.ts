import db, { ensureUser } from '../modules/db.ts';

/*
 * A deterministic dev world, loaded through the real db layer: one user per
 * persona (admin, teacher, helper, student, student-in-another-class), two
 * classes, and a mix of open and closed help requests. The permissions test
 * matrix depends on these exact ids.
 */

export const users = [
  // berkeley.net address => is_admin (see ensureUser)
  { id: 'admin1', email: 'admin@berkeley.net', name: 'Alex Admin' },
  { id: 'teacher1', email: 'teacher@example.com', name: 'Pat Teacher' },
  { id: 'helper1', email: 'helper@example.com', name: 'Harper Helper' },
  { id: 'student1', email: 'student1@example.com', name: 'Sam Student' },
  { id: 'student2', email: 'student2@example.com', name: 'Sasha Student' },
  { id: 'outsider1', email: 'outsider@example.com', name: 'Ollie Outsider' },
];

export const classes = [
  {
    id: 'apcs',
    name: 'AP CS',
    google_id: 'g-apcs',
    members: [
      { user_id: 'teacher1', role: 'teacher' },
      { user_id: 'helper1', role: 'helper' },
      { user_id: 'student1', role: 'student' },
      { user_id: 'student2', role: 'student' },
    ],
  },
  {
    id: 'intro',
    name: 'Intro CS',
    google_id: 'g-intro',
    members: [
      { user_id: 'teacher1', role: 'teacher' },
      { user_id: 'outsider1', role: 'student' },
    ],
  },
];

/*
 * Inserted in order, so these get help.rowid 1, 2, 3, ... Note: at most one
 * request per (user, class) pair here — the help table's primary key is
 * (user_id, class_id, created_at) and seeding runs within one second.
 */
export const helpRequests = [
  { user_id: 'student1', class_id: 'apcs', problem: 'Open request from student1', closed: false },
  { user_id: 'student2', class_id: 'apcs', problem: 'Open request from student2', closed: false },
  { user_id: 'helper1', class_id: 'apcs', problem: 'Closed request from helper1', closed: true },
  {
    user_id: 'outsider1',
    class_id: 'intro',
    problem: 'Open request from outsider1',
    closed: false,
  },
];

export const seed = (): void => {
  for (const u of users) {
    ensureUser(u.id, u.email, u.name);
  }
  for (const c of classes) {
    db.insertClass({ id: c.id, name: c.name, google_id: c.google_id });
    for (const m of c.members) {
      db.insertMember({ user_id: m.user_id, class_id: c.id, role: m.role });
    }
  }
  for (const h of helpRequests) {
    const id = db.requestHelp({ user_id: h.user_id, class_id: h.class_id, problem: h.problem });
    if (h.closed) {
      db.finishHelp({ id });
    }
  }
};

import db, { ensureUser } from '../modules/db.ts';

/*
 * A deterministic dev world, loaded through the real db layer: one user per
 * persona (admin, owner, teacher, helper, student,
 * student-in-another-class), two classes, and a mix of open and closed help
 * requests. The permissions test matrix depends on these exact ids.
 */

export const users = [
  // berkeley.net address => is_admin (see ensureUser)
  { id: 'admin1', email: 'admin@berkeley.net', name: 'Alex Admin' },
  // The OWNER_EMAIL from permissions.ts, for the homepage admin block.
  { id: 'owner1', email: 'peterseibel@berkeley.net', name: 'Peter Seibel' },
  { id: 'teacher1', email: 'teacher@example.com', name: 'Pat Teacher' },
  { id: 'helper1', email: 'helper@example.com', name: 'Harper Helper' },
  { id: 'student1', email: 'student1@example.com', name: 'Sam Student' },
  { id: 'student2', email: 'student2@example.com', name: 'Sasha Student' },
  { id: 'outsider1', email: 'outsider@example.com', name: 'Ollie Outsider' },
];

// Both classes share room 303 so the room queue page (/r/303) has a class
// to switch to across periods, out of the box.
export const classes = [
  {
    id: 'apcs',
    name: 'AP CS',
    // Sections chosen so period order (intro first) differs from
    // alphabetical order, which the homepage-sorting test depends on.
    section: 'Period 4',
    room: '303',
    period: 4,
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
    section: 'Period 2',
    room: '303',
    period: 2,
    google_id: 'g-intro',
    members: [
      { user_id: 'teacher1', role: 'teacher' },
      { user_id: 'outsider1', role: 'student' },
    ],
  },
];

/*
 * Inserted in order, so these get help.rowid 1, 2, 3, ... They are seeded
 * with distinct backdated created_at values (one second apart, oldest
 * first), so they can't collide with a request filed while the seeding
 * second is still ticking — the help table's primary key is
 * (user_id, class_id, created_at).
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
    db.insertClass({
      id: c.id,
      name: c.name,
      section: c.section,
      room: c.room,
      period: c.period,
      google_id: c.google_id,
    });
    for (const m of c.members) {
      db.insertMember({ user_id: m.user_id, class_id: c.id, role: m.role });
    }
  }
  helpRequests.forEach((h, i) => {
    const id = db.requestHelpAt({
      user_id: h.user_id,
      class_id: h.class_id,
      problem: h.problem,
      ago: helpRequests.length - i,
    });
    if (h.closed) {
      db.finishHelp({ id });
    }
  });
};

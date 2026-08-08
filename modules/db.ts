import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB } from 'pugsql';
import { DB_PATH } from './config.ts';

const DIRNAME = path.dirname(fileURLToPath(import.meta.url));

/*
 * The one place a database connection is opened. schema.sql is idempotent
 * and runs at every boot, so a fresh database materializes on first start.
 */
const db = new DB(DB_PATH, path.join(DIRNAME, 'schema.sql')).addQueries(
  path.join(DIRNAME, 'queries.sql'),
);

export default db;

/*
 * The shape of the student objects we get from the Google Classroom roster
 * API (structurally compatible with googleapis' Schema$Student).
 */
type RosterStudent = {
  profile?: {
    id?: string | null;
    emailAddress?: string | null;
    name?: { fullName?: string | null } | null;
  } | null;
};

const ensureRosterUser = (s: RosterStudent) => {
  const profile = s.profile ?? {};
  db.insertUser({
    id: profile.id,
    email: profile.emailAddress,
    name: profile.name?.fullName,
    google_name: profile.name?.fullName,
    is_admin: 0,
  });
};

/*
 * Create a class from a Google Classroom course: the class row, the teacher
 * membership, and a student membership (creating the user if needed) for
 * everyone on the roster.
 */
export const createClass = (
  id: string,
  teacherId: string,
  name: string,
  section: string | null,
  googleId: string,
  students: RosterStudent[],
): void => {
  db.transaction(() => {
    db.insertClass({ id, name, section, google_id: googleId });
    db.insertMember({ user_id: teacherId, class_id: id, role: 'teacher' });
    for (const s of students) {
      ensureRosterUser(s);
      db.insertMember({ user_id: s.profile?.id, class_id: id, role: 'student' });
    }
  });
};

/*
 * Resync a class with its Google Classroom roster: update the name and
 * section, add missing students, and remove students no longer on the
 * roster.
 */
export const resyncClass = (
  classId: string,
  name: string,
  section: string | null,
  students: RosterStudent[],
): void => {
  db.transaction(() => {
    db.updateClass({ name, section, id: classId });
    const current: string[] = db.studentIds({ class_id: classId });
    const toKeep = new Set(students.map((s) => s.profile?.id));
    for (const s of students) {
      ensureRosterUser(s);
      db.insertMember({ user_id: s.profile?.id, class_id: classId, role: 'student' });
    }
    for (const c of current) {
      if (!toKeep.has(c)) {
        db.removeMember({ user_id: c, class_id: classId });
      }
    }
  });
};

/*
 * Get the user with the given Google id, creating them on first login.
 */
export const ensureUser = (id: string, email: string, googleName: string): SessionUser => {
  const existing = db.userById({ id });
  if (existing) {
    return existing;
  }

  // admin really means teacher. Anyone with a non-student berkeley.net
  // address can use this.
  const isAdmin = email.endsWith('@berkeley.net') ? 1 : 0;

  // We create a user with the name we got from Google in both name fields
  // but later we may change `name` to be the student's preferred name.
  db.insertUser({ id, email, name: googleName, google_name: googleName, is_admin: isAdmin });
  return db.userById({ id });
};

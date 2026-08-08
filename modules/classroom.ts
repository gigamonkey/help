import type { OAuth2Client } from 'google-auth-library';
import { type classroom_v1, google } from 'googleapis';

/*
 * Helpers for the Google Classroom API (used by the index page's course
 * list and the admin create/resync flows).
 */

const classroom = google.classroom('v1');

export type Course = classroom_v1.Schema$Course & { fullName?: string };
export type Student = classroom_v1.Schema$Student;

export const fullClassName = (c: Course) =>
  c.section ? `${c.name} - ${c.section}` : (c.name ?? '');

/*
 * Sort classes by period number: the section is dedicated free text
 * ("Period 3", "P3", plain "3"), so the first number in it is the period.
 * Classes with no section (or no number in it) sort last, alphabetically.
 */
const period = (c: SortableClass): number => {
  const m = c.section ? /\d+/.exec(c.section) : null;
  return m ? Number(m[0]) : Infinity;
};

// The optional/nullable fields let a Schema$Course sort directly.
type SortableClass = { name?: string | null; section?: string | null };

export const byPeriod = (a: SortableClass, b: SortableClass): number =>
  period(a) - period(b) || (a.name ?? '').localeCompare(b.name ?? '');

export const oneCourse = (auth: OAuth2Client, id: string) => classroom.courses.get({ id, auth });

export const allCourses = async (oauth2client: OAuth2Client, userId: string): Promise<Course[]> => {
  const mainArgs = { teacherId: 'me', courseStates: ['ACTIVE'], auth: oauth2client };

  let pageToken: string | undefined;
  let results: Course[] = [];
  do {
    const args = pageToken ? { ...mainArgs, pageToken } : mainArgs;
    const res = await classroom.courses.list(args);
    results = results.concat(res.data.courses ?? []);
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  const owned = results.filter((c) => c.ownerId === userId);
  return owned.sort((a, b) => (fullClassName(a) < fullClassName(b) ? -1 : 1));
};

export const allStudents = async (
  oauth2client: OAuth2Client,
  courseId: string,
): Promise<Student[]> => {
  const mainArgs = { courseId, auth: oauth2client };

  let pageToken: string | undefined;
  let results: Student[] = [];
  do {
    const args = pageToken ? { ...mainArgs, pageToken } : mainArgs;
    const res = await classroom.courses.students.list(args);
    results = results.concat(res.data.students ?? []);
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return results;
};

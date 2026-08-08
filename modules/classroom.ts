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
 * Sort classes by the period number in their name ("AP CS - Period 3",
 * "Intro CS - 3rd period"); classes with no discernible period sort last,
 * alphabetically.
 */
const period = (name: string): number => {
  const m = /period\s*(\d+)/i.exec(name) ?? /(\d+)(?:st|nd|rd|th)?\s+period/i.exec(name);
  return m ? Number(m[1]) : Infinity;
};

export const byPeriod = (a: { name: string }, b: { name: string }): number =>
  period(a.name) - period(b.name) || a.name.localeCompare(b.name);

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

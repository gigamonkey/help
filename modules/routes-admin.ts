import { allStudents, fullClassName, oneCourse } from './classroom.ts';
import db, { createClass, resyncClass } from './db.ts';
import oauth from './oauth.ts';
import { adminOnly, guardedRouter } from './permissions.ts';

/*
 * Google Classroom integration: create a class from a Classroom course and
 * resync its roster. Admin only.
 */
const router = guardedRouter(adminOnly);

router.get('/classes/:google_id/create', async (req, res) => {
  const google_id = req.params.google_id as string;

  const teacherId = req.session?.user?.id as string;
  // FIXME: I think it may be possible to just pass the auth data rather than
  // constructing an oauth2client object. Look into that later.
  const oauth2client = oauth.oauth2client();
  oauth2client.setCredentials(req.session?.auth ?? {});
  const course = await oneCourse(oauth2client, google_id);

  const c = course.data;
  const students = await allStudents(oauth2client, c.id as string);

  createClass(
    c.id as string,
    teacherId,
    fullClassName(c),
    c.section ?? null,
    c.id as string,
    students,
  );
  res.redirect(`/c/${c.id}/students`);
});

router.get('/classes/:google_id/resync', async (req, res) => {
  const google_id = req.params.google_id as string;

  const oauth2client = oauth.oauth2client();
  oauth2client.setCredentials(req.session?.auth ?? {});
  const students = await allStudents(oauth2client, google_id);
  const course = await oneCourse(oauth2client, google_id);

  const clazz = db.classByGoogleId({ google_id });
  resyncClass(clazz.id, fullClassName(course.data), course.data.section ?? null, students);
  res.redirect(`/c/${clazz.id}/students`);
});

export default router;

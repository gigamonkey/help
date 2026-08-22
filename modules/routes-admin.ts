import { setSimulatedTime } from './bells.ts';
import { allCourses, allStudents, oneCourse, sectionPeriod } from './classroom.ts';
import db, { createClass, resyncClass } from './db.ts';
import { broadcastAll } from './live.ts';
import oauth from './oauth.ts';
import { adminOnly, guardedRouter, ownerOnly } from './permissions.ts';

/*
 * Google Classroom integration: create a class from a Classroom course and
 * resync its roster. Admin only. (Plus the owner-only simulated-clock
 * control from the homepage's "For admin" block.)
 */
const router = guardedRouter(adminOnly);

/*
 * Move the bell schedule's clock to a simulated moment (or back to real
 * time), for testing the room queue pages. Process-global, so owner only,
 * on top of the router's admin guard. Every open page is told to refresh
 * so projectors flip immediately.
 */
router.post('/debug-time', ownerOnly, (req, res) => {
  const time = typeof req.body.time === 'string' ? req.body.time.trim() : '';
  try {
    setSimulatedTime(req.body.clear ? null : time || null);
  } catch {
    res.sendStatus(400);
    return;
  }
  broadcastAll();
  res.redirect('/');
});

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
    c.name ?? '',
    c.section ?? null,
    c.room ?? null,
    sectionPeriod(c.section),
    c.id as string,
    students,
  );
  res.redirect(`/c/${c.id}/students`);
});

/*
 * Bulk versions of create and resync over the current teacher's Classroom
 * courses: create-all creates every course not yet set up, resync-all
 * resyncs every one that is.
 */
router.get('/classes/create-all', async (req, res) => {
  const teacherId = req.session?.user?.id as string;
  const oauth2client = oauth.oauth2client();
  oauth2client.setCredentials(req.session?.auth ?? {});

  const existing = new Set(db.googleClassroomIds().map(String));
  for (const c of await allCourses(oauth2client, teacherId)) {
    if (!existing.has(String(c.id))) {
      const students = await allStudents(oauth2client, c.id as string);
      createClass(
        c.id as string,
        teacherId,
        c.name ?? '',
        c.section ?? null,
        c.room ?? null,
        sectionPeriod(c.section),
        c.id as string,
        students,
      );
    }
  }
  res.redirect('/');
});

router.get('/classes/resync-all', async (req, res) => {
  const userId = req.session?.user?.id as string;
  const oauth2client = oauth.oauth2client();
  oauth2client.setCredentials(req.session?.auth ?? {});

  const existing = new Set(db.googleClassroomIds().map(String));
  for (const c of await allCourses(oauth2client, userId)) {
    if (existing.has(String(c.id))) {
      const students = await allStudents(oauth2client, c.id as string);
      const clazz = db.classByGoogleId({ google_id: c.id });
      resyncClass(clazz.id, c.name ?? '', c.section ?? null, students);
    }
  }
  res.redirect('/');
});

router.get('/classes/:google_id/resync', async (req, res) => {
  const google_id = req.params.google_id as string;

  const oauth2client = oauth.oauth2client();
  oauth2client.setCredentials(req.session?.auth ?? {});
  const students = await allStudents(oauth2client, google_id);
  const course = await oneCourse(oauth2client, google_id);

  const clazz = db.classByGoogleId({ google_id });
  resyncClass(clazz.id, course.data.name ?? '', course.data.section ?? null, students);
  res.redirect(`/c/${clazz.id}/students`);
});

export default router;

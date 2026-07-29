import { Router } from 'express';
import { allCourses, fullClassName } from './classroom.ts';
import { DEV_MODE } from './config.ts';
import db from './db.ts';
import oauth from './oauth.ts';
import { isAdmin } from './permissions.ts';

/*
 * Pages available to any logged-in user. (The profile pages stay guarded
 * in-handler as self-or-admin.)
 */
const router = Router();

router.get('/', async (req, res) => {
  const id = req.session?.user?.id as string;
  const user = db.userById({ id });
  const memberships = db.classMemberships({ user_id: id });

  if (isAdmin(user)) {
    res.locals.isAdmin = true;

    // No real OAuth in DEV_MODE, so no Classroom course list either.
    if (DEV_MODE) {
      res.render('index.njk', { memberships, courses: [], googleIds: [] });
      return;
    }

    const oauth2client = oauth.oauth2client();
    oauth2client.setCredentials(req.session?.auth ?? {});
    const courses = await allCourses(oauth2client, id);
    for (const c of courses) {
      c.fullName = fullClassName(c);
    }
    const googleIds = db.googleClassroomIds().map(String);
    res.render('index.njk', { memberships, courses, googleIds });
  } else {
    res.render('index.njk', { memberships });
  }
});

router.get('/c/:class_id', (req, res) => {
  const { class_id } = req.params;
  res.render('class.njk', db.getClass({ class_id, user_id: req.session?.user?.id }));
});

router.get('/c/:class_id/help/:id', (req, res) => {
  const { id, class_id } = req.params;
  res.render('help.njk', { id, class_id, item: db.getHelp({ id }) });
});

router.get('/c/:class_id/help', (req, res) => {
  const { class_id } = req.params;
  res.render('up-next.njk', { class_id, queue: db.queue({ class_id }) });
});

router.post('/c/:class_id/help', (req, res) => {
  const { class_id } = req.params;
  const { problem } = req.body;
  db.requestHelp({ user_id: req.session?.user?.id, class_id, problem });
  res.redirect('help');
});

router.get('/c/:class_id/queue', (req, res) => {
  const { class_id } = req.params;
  res.render('queue.njk', { class_id, queue: db.queue({ class_id }) });
});

router.get('/c/:class_id/done', (req, res) => {
  const { class_id } = req.params;
  res.render('done.njk', { class_id, queue: db.done({ class_id }) });
});

// Profile pages: yourself, or any user if you're an admin.
router.get('/users/:id', (req, res) => {
  const requestedUser = db.userById({ id: req.params.id });
  const currentUser = db.userById({ id: req.session?.user?.id });
  if (requestedUser?.id === currentUser?.id || isAdmin(currentUser)) {
    res.render('user.njk', requestedUser);
  } else {
    res.sendStatus(401);
  }
});

router.post('/users/:id', (req, res) => {
  const requestedUser = db.userById({ id: req.params.id });
  const currentUser = db.userById({ id: req.session?.user?.id });
  if (requestedUser?.id === currentUser?.id || isAdmin(currentUser)) {
    db.updateNameAndPronouns({
      id: requestedUser.id,
      name: req.body.preferredName,
      pronouns: req.body.pronouns,
    });
    res.render('user.njk', db.userById({ id: requestedUser.id }));
  } else {
    res.sendStatus(401);
  }
});

export default router;

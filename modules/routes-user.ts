import { Router } from 'express';
import { currentPeriodNumbers, secondsToNextSwitch, simulatedNow } from './bells.ts';
import { allCourses, byPeriod, fullClassName } from './classroom.ts';
import { DEV_MODE } from './config.ts';
import db from './db.ts';
import { broadcastQueueChange, roomChannel, subscribe } from './live.ts';
import oauth from './oauth.ts';
import { isAdmin, isOwner } from './permissions.ts';

/*
 * Pages available to any logged-in user. (The profile pages stay guarded
 * in-handler as self-or-admin.)
 */
const router = Router();

type RoomPeriod = { id: string; room: string | null; period: number | null };

router.get('/', async (req, res) => {
  const id = req.session?.user?.id as string;
  const user = db.userById({ id });
  const memberships = db.classMemberships({ user_id: id }).sort(byPeriod);

  if (isAdmin(user)) {
    res.locals.isAdmin = true;

    if (isOwner(user)) {
      res.locals.isOwner = true;
      res.locals.allClasses = db.allClasses();
      res.locals.simulatedTime = simulatedNow();
    }

    // No real OAuth in DEV_MODE, so no Classroom course list either.
    if (DEV_MODE) {
      res.render('index.njk', { memberships, courses: [], googleIds: [] });
      return;
    }

    const oauth2client = oauth.oauth2client();
    oauth2client.setCredentials(req.session?.auth ?? {});
    const courses = (await allCourses(oauth2client, id)).sort(byPeriod);
    for (const c of courses) {
      c.fullName = fullClassName(c);
    }
    const googleIds = db.googleClassroomIds().map(String);
    // Stored room/period by class id (= Classroom course id), for the
    // inline settings forms on the created courses' rows.
    const settings = Object.fromEntries(db.allClassSettings().map((c: RoomPeriod) => [c.id, c]));
    res.render('index.njk', { memberships, courses, googleIds, settings });
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
  broadcastQueueChange(class_id);
  res.redirect('help');
});

// The class's live-update stream (see live.ts). Held open until the
// client disconnects.
router.get('/c/:class_id/events', (req, res) => {
  subscribe(req.params.class_id, res);
});

router.get('/c/:class_id/queue', (req, res) => {
  const { class_id } = req.params;
  res.render('queue.njk', { class_id, queue: db.queue({ class_id }) });
});

router.get('/c/:class_id/done', (req, res) => {
  const { class_id } = req.params;
  res.render('done.njk', { class_id, queue: db.done({ class_id }) });
});

/*
 * The per-room queue page: shows whichever class is in session in the
 * room right now (or is up next, during passing) and switches classes on
 * its own as the periods change — leave it on the projector all day. The
 * page re-fetches itself at the next bell (data-refresh-in, see live.js)
 * and on queue changes via the room's live-update stream.
 */
router.get('/r/:room', (req, res) => {
  const room = req.params.room.trim();
  const clazz = currentPeriodNumbers()
    .map((period) => db.classForRoomPeriod({ room, period }))
    .find(Boolean);
  res.render('room.njk', {
    room,
    clazz,
    className: clazz ? db.className({ class_id: clazz.id }) : undefined,
    queue: clazz ? db.queue({ class_id: clazz.id }) : [],
    refresh_in: secondsToNextSwitch(),
  });
});

router.get('/r/:room/events', (req, res) => {
  subscribe(roomChannel(req.params.room), res);
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

import cookieParser from 'cookie-parser';
import express from 'express';
import type { OAuth2Client } from 'google-auth-library';
import { type classroom_v1, google } from 'googleapis';
import morgan from 'morgan';
import nunjucks from 'nunjucks';
import dateFilter from 'nunjucks-date-filter';
import markdownFilter from 'nunjucks-markdown-filter';
import { PORT, SESSION_SECRET } from './modules/config.ts';
import db, { createClass, resyncClass } from './modules/db.ts';
import oauth from './modules/oauth.ts';
import Permissions from './modules/permissions.ts';
import requireLogin from './modules/require-login.ts';

const classroom = google.classroom('v1');

type Course = classroom_v1.Schema$Course & { fullName?: string };
type Student = classroom_v1.Schema$Student;

const noAuthRequired = {
  '/auth': true,
  '/favicon.ico': true,
  '/health': true,
  '/logout': true,
};

const app = express();
const login = requireLogin(noAuthRequired, SESSION_SECRET);
const permissions = new Permissions();

const env = nunjucks.configure('views', {
  autoescape: true,
  express: app,
});

// FIXME: this doesn't run things through DOMpurify. May want to fix that.
markdownFilter.install(env);
dateFilter.install(env);

env.addFilter('slug', (s: string) => s.toLowerCase().replaceAll(/\W+/g, '-'));

// Permission schemes.
const isTeacher = permissions.oneOf('teacher');
const isHelper = permissions.oneOf('teacher', 'helper');

// Route permission handlers
const teacherOnly = permissions.classRoute(isTeacher);
const helperOnly = permissions.classRoute(isHelper);
const adminOnly = permissions.route(permissions.isAdmin);

app.use(express.json());
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(login.require());

// Middleware to find the name of the class and the user's role in the class.
app.use('/c/:class_id', (req, res, next) => {
  const { class_id } = req.params;
  const className = db.className({ class_id });
  if (className === undefined) {
    res.sendStatus(404);
    return;
  }
  res.locals.className = className;
  const sessionUser = req.session?.user;
  if (sessionUser) {
    const member = db.classMember({ user_id: sessionUser.id, class_id });
    sessionUser.role = member?.role;
    res.locals.user = sessionUser;
  }
  next();
});

app.use(express.static('public'));

app.get('/health', (_req, res) => res.send('Ok.'));

app.get('/logout', (_req, res) => {
  login.logout(res);
  res.send('<html><body><p>Logged out. <a href="/">Start over</a></p></html>');
});

app.get('/auth', (req, res) => {
  login.finish(req, res);
});

////////////////////////////////////////////////////////////////////////////////
// Class page

app.get('/c/:class_id', (req, res) => {
  const { class_id } = req.params;
  const clazz = db.getClass({ class_id, user_id: req.session?.user?.id });
  res.render('class.njk', clazz);
});

////////////////////////////////////////////////////////////////////////////////
// Pages

app.get('/', async (req, res) => {
  const id = req.session?.user?.id as string;
  const user = db.userById({ id });
  const memberships = db.classMemberships({ user_id: id });

  if (permissions.isAdmin(user)) {
    res.locals.isAdmin = true;

    const oauth2client = oauth.oauth2client();
    oauth2client.setCredentials(req.session?.auth ?? {});
    try {
      const courses = await allCourses(oauth2client, id);
      for (const c of courses) {
        c.fullName = fullClassName(c);
      }
      const googleIds = db.googleClassroomIds().map(String);
      res.render('index.njk', { memberships, courses, googleIds });
    } catch {
      login.logout(res);
      res.redirect('/logout');
    }
  } else {
    res.render('index.njk', { memberships });
  }
});

app.get('/c/:class_id/help/:id', (req, res) => {
  const { id, class_id } = req.params;
  res.render('help.njk', { id, class_id, item: db.getHelp({ id }) });
});

app.get('/c/:class_id/help', (req, res) => {
  const { class_id } = req.params;
  res.render('up-next.njk', { class_id, queue: db.queue({ class_id }) });
});

app.post('/c/:class_id/help', (req, res) => {
  const { class_id } = req.params;
  const { problem } = req.body;
  db.requestHelp({ user_id: req.session?.user?.id, class_id, problem });
  res.redirect('help');
});

app.get('/c/:class_id/queue', (req, res) => {
  const { class_id } = req.params;
  res.render('queue.njk', { class_id, queue: db.queue({ class_id }) });
});

app.get('/c/:class_id/done', (req, res) => {
  const { class_id } = req.params;
  res.render('done.njk', { class_id, queue: db.done({ class_id }) });
});

////////////////////////////////////////////////////////////////////////////////
// Help items state changes.

app.get('/c/:class_id/help/:id/done', (req, res) => {
  const { id } = req.params;
  const help = db.getHelp({ id });

  // The helper roles can close any item; the requester can close their own.
  const pred = (user: SessionUser) => isHelper(user) || user?.id === help?.user_id;

  permissions.classRoute(pred)((req, res) => {
    db.finishHelp({ id });
    res.redirect(req.get('Referrer') ?? '/');
  })(req, res);
});

app.get(
  '/c/:class_id/help/:id/reopen',
  helperOnly((req, res) => {
    db.reopenHelp({ id: req.params.id });
    res.redirect(req.get('Referrer') ?? '/');
  }),
);

app.get(
  '/c/:class_id/students',
  teacherOnly((req, res) => {
    const { class_id } = req.params;
    res.render('students.njk', { ...req.params, students: db.studentStats({ class_id }) });
  }),
);

app.get(
  '/c/:class_id/members',
  teacherOnly((req, res) => {
    const { class_id } = req.params;
    res.render('members.njk', { ...req.params, members: db.memberStats({ class_id }) });
  }),
);

app.get('/users/:id', (req, res) => {
  const requestedUser = db.userById({ id: req.params.id });
  const currentUser = db.userById({ id: req.session?.user?.id });
  if (requestedUser?.id === currentUser?.id || permissions.isAdmin(currentUser)) {
    res.render('user.njk', requestedUser);
  } else {
    res.sendStatus(401);
  }
});

app.post('/users/:id', (req, res) => {
  const requestedUser = db.userById({ id: req.params.id });
  const currentUser = db.userById({ id: req.session?.user?.id });
  if (requestedUser?.id === currentUser?.id || permissions.isAdmin(currentUser)) {
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

////////////////////////////////////////////////////////////////////////////////
// Courses

app.get(
  '/classes/:google_id/create',
  adminOnly(async (req, res) => {
    const google_id = req.params.google_id as string;

    const teacherId = req.session?.user?.id as string;
    // FIXME: I think it may be possible to just pass the auth data rather than
    // constructing an oauth2client object. Look into that later.
    const oauth2client = oauth.oauth2client();
    oauth2client.setCredentials(req.session?.auth ?? {});
    const course = await oneCourse(oauth2client, google_id);

    const c = course.data;
    const students = await allStudents(oauth2client, c.id as string);

    createClass(c.id as string, teacherId, fullClassName(c), c.id as string, students);
    res.redirect(`/c/${c.id}/students`);
  }),
);

app.get(
  '/classes/:google_id/resync',
  adminOnly(async (req, res) => {
    const google_id = req.params.google_id as string;

    const oauth2client = oauth.oauth2client();
    oauth2client.setCredentials(req.session?.auth ?? {});
    const students = await allStudents(oauth2client, google_id);
    const course = await oneCourse(oauth2client, google_id);

    const clazz = db.classByGoogleId({ google_id });
    resyncClass(clazz.id, fullClassName(course.data), students);
    res.redirect(`/c/${clazz.id}/students`);
  }),
);

const fullClassName = (c: Course) => (c.section ? `${c.name} - ${c.section}` : (c.name ?? ''));

const oneCourse = (auth: OAuth2Client, id: string) => classroom.courses.get({ id, auth });

const allCourses = async (oauth2client: OAuth2Client, userId: string): Promise<Course[]> => {
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

const allStudents = async (oauth2client: OAuth2Client, courseId: string): Promise<Student[]> => {
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

////////////////////////////////////////////////////////////////////////////////
// Start server

const server = app.listen(PORT, '0.0.0.0', () => {
  const address = server.address();
  if (address && typeof address !== 'string') {
    console.log(`App is listening on port ${address.port}`);
    console.log(`http://${address.address}:${address.port}/`);
  }
});

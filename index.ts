import cookieParser from 'cookie-parser';
import type { Response } from 'express';
import express from 'express';
import type { OAuth2Client } from 'google-auth-library';
import { type classroom_v1, google } from 'googleapis';
import morgan from 'morgan';
import nunjucks from 'nunjucks';
import dateFilter from 'nunjucks-date-filter';
import markdownFilter from 'nunjucks-markdown-filter';
import { DB_PATH, PORT, SESSION_SECRET } from './modules/config.ts';
import oauth from './modules/oauth.ts';
import Permissions from './modules/permissions.ts';
import requireLogin from './modules/require-login.ts';
import DB from './modules/storage.js';

const classroom = google.classroom('v1');

type Course = classroom_v1.Schema$Course & { fullName?: string };
type Student = classroom_v1.Schema$Student;

const noAuthRequired = {
  '/auth': true,
  '/favicon.ico': true,
  '/health': true,
  '/logout': true,
};

const db = new DB(DB_PATH);
const app = express();
const login = requireLogin(noAuthRequired, db, SESSION_SECRET);
const permissions = new Permissions(db);

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

// Middleware to find the name of the class and the users role in the class.
app.use('/c/:class_id', (req, res, next) => {
  const { class_id } = req.params;
  db.getClassName(class_id, (err: Error | null, data: { name: string }) => {
    if (err) {
      res.sendStatus(500);
    } else {
      const { name } = data;
      res.locals.className = name;
      const sessionUser = req.session?.user;
      if (sessionUser) {
        res.locals.user = sessionUser;
        db.classMember(sessionUser.id, class_id, (err: Error | null, user: SessionUser) => {
          if (err) {
            console.log(err);
            res.sendStatus(500);
          } else {
            sessionUser.role = user.role;
          }
        });
      }
      next();
    }
  });
});

app.use(express.static('public'));

const dbRender = (res: Response, err: Error | null, template: string, data: object) => {
  if (err) {
    console.log(err);
    res.sendStatus(500);
  } else {
    res.render(template, data);
  }
};

const dbRedirect = (res: Response, err: Error | null, path: string) => {
  if (err) {
    console.log(err);
    res.sendStatus(500);
  } else {
    res.redirect(path);
  }
};

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
  const id = req.session?.user?.id;
  db.getClass(class_id, id, (err: Error | null, clazz: object) => {
    if (err) {
      console.log(err);
      res.sendStatus(500);
    } else {
      res.render('class.njk', clazz);
    }
  });
});

////////////////////////////////////////////////////////////////////////////////
// Pages

app.get('/', (req, res) => {
  const id = req.session?.user?.id;
  db.userById(id, async (_err1: Error | null, user: SessionUser) => {
    if (permissions.isAdmin(user)) {
      res.locals.isAdmin = true;

      const oauth2client = oauth.oauth2client();
      oauth2client.setCredentials(req.session?.auth ?? {});
      try {
        const courses = await allCourses(oauth2client, id as string);
        for (const c of courses) {
          c.fullName = fullClassName(c);
        }
        db.googleClassroomIds((_err: Error | null, ids: { google_id: string | number }[]) => {
          db.classMemberships(id, (err: Error | null, memberships: object[]) => {
            dbRender(res, err, 'index.njk', { memberships, courses, googleIds: extractIds(ids) });
          });
        });
      } catch {
        login.logout(res);
        res.redirect('/logout');
      }
    } else {
      db.classMemberships(id, (err: Error | null, memberships: object[]) => {
        dbRender(res, err, 'index.njk', { memberships });
      });
    }
  });
});

app.get('/c/:class_id/help/:id', (req, res) => {
  const { id, class_id } = req.params;
  db.getHelp(id, (err: Error | null, item: object) =>
    dbRender(res, err, 'help.njk', { id, class_id, item }),
  );
});

app.get('/c/:class_id/help', (req, res) => {
  const { class_id } = req.params;
  db.queue(class_id, (err: Error | null, queue: object[]) =>
    dbRender(res, err, 'up-next.njk', { class_id, queue }),
  );
});

app.post('/c/:class_id/help', (req, res) => {
  const { class_id } = req.params;
  const { problem } = req.body;
  const id = req.session?.user?.id;
  db.requestHelp(id, class_id, problem, (err: Error | null) => {
    if (err) {
      console.log(err);
      res.sendStatus(500);
    } else {
      res.redirect(`help`);
    }
  });
});

app.get('/c/:class_id/queue', (req, res) => {
  const { class_id } = req.params;
  db.queue(class_id, (err: Error | null, queue: object[]) =>
    dbRender(res, err, 'queue.njk', { class_id, queue }),
  );
});

app.get('/c/:class_id/done', (req, res) => {
  const { class_id } = req.params;
  db.done(class_id, (err: Error | null, queue: object[]) =>
    dbRender(res, err, 'done.njk', { class_id, queue }),
  );
});

////////////////////////////////////////////////////////////////////////////////
// Help items state changes.

app.get('/c/:class_id/help/:id/done', (req, res) => {
  const { id } = req.params;

  db.getHelp(id, (_err: Error | null, help: { user_id: string }) => {
    const pred = (user: SessionUser) => {
      return isHelper(user) || user.id === help.user_id;
    };
    permissions.classRoute(pred)((req, res) => {
      db.finishHelp(id, (err: Error | null) => dbRedirect(res, err, req.get('Referrer') ?? '/'));
    })(req, res);
  });
});

app.get(
  '/c/:class_id/help/:id/reopen',
  helperOnly((req, res) => {
    const { id } = req.params;
    db.reopenHelp(id, (err: Error | null) => dbRedirect(res, err, req.get('Referrer') ?? '/'));
  }),
);

app.get(
  '/c/:class_id/students',
  teacherOnly((req, res) => {
    const { class_id } = req.params;
    db.studentStats(class_id, (_err: Error | null, students: object[]) => {
      res.render('students.njk', { ...req.params, students });
    });
  }),
);

app.get(
  '/c/:class_id/members',
  teacherOnly((req, res) => {
    const { class_id } = req.params;
    db.memberStats(class_id, (_err: Error | null, members: object[]) => {
      res.render('members.njk', { ...req.params, members });
    });
  }),
);

app.get('/users/:id', (req, res) => {
  const { id } = req.params;
  db.userById(id, (_err1: Error | null, requestedUser: SessionUser) => {
    db.userById(req.session?.user?.id, (_err2: Error | null, currentUser: SessionUser) => {
      if (requestedUser.id === currentUser.id || permissions.isAdmin(currentUser)) {
        res.render('user.njk', requestedUser);
      } else {
        res.sendStatus(401);
      }
    });
  });
});

app.post('/users/:id', (req, res) => {
  const { id } = req.params;
  db.userById(id, (_err1: Error | null, requestedUser: SessionUser) => {
    db.userById(req.session?.user?.id, (_err2: Error | null, currentUser: SessionUser) => {
      if (requestedUser.id === currentUser.id || permissions.isAdmin(currentUser)) {
        db.updateNameAndPronouns(
          requestedUser.id,
          req.body.preferredName,
          req.body.pronouns,
          (_err3: Error | null, user: SessionUser) => {
            res.render('user.njk', user);
          },
        );
      } else {
        res.sendStatus(401);
      }
    });
  });
});

////////////////////////////////////////////////////////////////////////////////
// Courses

app.get(
  '/classes/:google_id/create',
  adminOnly(async (req, res) => {
    const { google_id } = req.params;

    const teacherId = req.session?.user?.id;
    // FIXME: I think it may be possible to just pass the auth data rather than
    // constructing an oauth2client object. Look into that later.
    const oauth2client = oauth.oauth2client();
    oauth2client.setCredentials(req.session?.auth ?? {});
    const course = await oneCourse(oauth2client, google_id as string);

    const c = course.data;
    const students = await allStudents(oauth2client, c.id as string);
    const className = fullClassName(c);
    const classId = c.id;

    db.createClass(classId, teacherId, className, c.id, students, (err: Error | null) =>
      dbRedirect(res, err, `/c/${classId}/students`),
    );
  }),
);

app.get(
  '/classes/:google_id/resync',
  adminOnly(async (req, res) => {
    const { google_id } = req.params;

    const oauth2client = oauth.oauth2client();
    oauth2client.setCredentials(req.session?.auth ?? {});
    const students = await allStudents(oauth2client, google_id as string);
    const course = await oneCourse(oauth2client, google_id as string);

    db.classByGoogleId(google_id, (_err: Error | null, data: { id: string }) => {
      const classId = data.id;
      const name = fullClassName(course.data);
      db.resyncClass(classId, name, students, (err: Error | null) =>
        dbRedirect(res, err, `/c/${classId}/students`),
      );
    });
  }),
);

const fullClassName = (c: Course) => (c.section ? `${c.name} - ${c.section}` : (c.name ?? ''));

const extractIds = (googleIds: { google_id: string | number }[]) =>
  googleIds.map((r) => String(r.google_id));

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

db.setup(() => {
  console.log('DB is set up.');
  const server = app.listen(PORT, '0.0.0.0', () => {
    const address = server.address();
    if (address && typeof address !== 'string') {
      console.log(`App is listening on port ${address.port}`);
      console.log(`http://${address.address}:${address.port}/`);
    }
  });
});

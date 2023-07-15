import 'dotenv/config';
import cookieParser from 'cookie-parser';
import dateFilter from 'nunjucks-date-filter';
import express from 'express';
import markdownFilter from 'nunjucks-markdown-filter';
import nunjucks from 'nunjucks';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';

import DB from './modules/storage.js';
import requireLogin from './modules/require-login.js';
import Permissions from './modules/permissions.js';
import oauth from './modules/oauth.js';

const classroom = google.classroom('v1');

const FILENAME = fileURLToPath(import.meta.url);
const DIRNAME = path.dirname(FILENAME);

const { PORT, SECRET } = process.env;

const noAuthRequired = {
  '/auth': true,
  '/favicon.ico': true,
  '/health': true,
  '/logout': true,
};

const db = new DB('help.db');
const app = express();
const login = requireLogin(noAuthRequired, db, SECRET);
const permissions = new Permissions(db);

const env = nunjucks.configure('views', {
  autoescape: true,
  express: app,
});

// FIXME: this doesn't run things through DOMpurify. May want to fix that.
markdownFilter.install(env);
dateFilter.install(env);

env.addFilter('slug', (s) => s.toLowerCase().replaceAll(/\W+/g, '-'));

// Permission schemes.
const isTeacher = permissions.oneOf('teacher');
const isHelper = permissions.oneOf('teacher', 'helper');

// Route permission handlers
const teacherOnly = permissions.classRoute(isTeacher);
const helperOnly = permissions.classRoute(isHelper);
const adminOnly = permissions.route(permissions.isAdmin);

// Thunk permission handlers.
const ifTeacher = permissions.thunk(isTeacher);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(login.require());

// Middleware to find the name of the class and the users role in the class.
app.use('/c/:class_id', (req, res, next) => {
  const { class_id } = req.params;
  db.getClassName(class_id, (err, data) => {
    if (err) {
      res.sendStatus(500);
    } else {
      const { name } = data;
      res.locals.className = name;
      if (req.session?.user) {
        res.locals.user = req.session.user;
        db.classMember(req.session.user.id, class_id, (err, user) => {
          if (err) {
            console.log(err);
            res.sendStatus(500);
          } else {
            console.log(user);
            console.log(`Setting user role to ${user.role}`);
            res.locals.user.role = user.role;
          }
        });
      }
      next();
    }
  });
});

app.use(express.static('public'));

/* eslint-disable no-unused-vars */
const jsonSender = (res) => (err, data) => {
  if (err) {
    console.log('Error in jsonSender');
    console.log(err);
    res.sendStatus(500);
  } else if (!data) {
    console.log('No data');
    res.sendStatus(404);
  } else {
    res.type('json');
    res.send(JSON.stringify(data, null, 2));
  }
};
/* eslint-enable */

const dbRender = (res, err, template, data) => {
  if (err) {
    console.log(err);
    res.sendStatus(500);
  } else {
    res.render(template, data);
  }
};

const dbRedirect = (res, err, path) => {
  if (err) {
    console.log(err);
    res.sendStatus(500);
  } else {
    res.redirect(path);
  }
};

app.get('/health', (req, res) => res.send('Ok.'));

app.get('/logout', (req, res) => {
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
  const { id } = req.session.user;
  db.getClass(class_id, id, (err, clazz) => {
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
  const { id } = req.session.user;
  db.classMemberships(id, (err, memberships) => {
    dbRender(res, err, 'index.njk', { memberships });
  });
});

app.get('/c/:class_id/help/:id(\\d+)', (req, res) => {
  const { id, class_id } = req.params;
  db.getHelp(id, (err, item) => dbRender(res, err, 'help.njk', { id, class_id, item }));
});

app.get('/c/:class_id/help', (req, res) => {
  const { class_id } = req.params;
  db.queue(class_id, (err, queue) => dbRender(res, err, 'up-next.njk', { class_id, queue }));
});

app.post('/c/:class_id/help', (req, res) => {
  const { class_id } = req.params;
  const { problem } = req.body;
  const { id } = req.session.user;
  db.requestHelp(id, class_id, problem, (err) => {
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
  db.queue(class_id, (err, queue) => dbRender(res, err, 'queue.njk', { class_id, queue }));
});

app.get('/c/:class_id/done', (req, res) => {
  const { class_id } = req.params;
  db.done(class_id, (err, queue) => dbRender(res, err, 'done.njk', { class_id, queue }));
});

////////////////////////////////////////////////////////////////////////////////
// Help items state changes.

app.get(
  '/c/:class_id/help/:id/done',
  helperOnly((req, res) => {
    const { id } = req.params;
    db.finishHelp(id, (err) => dbRedirect(res, err, req.get('Referrer')));
  }),
);

app.get(
  '/c/:class_id/help/:id/reopen',
  helperOnly((req, res) => {
    const { id } = req.params;
    db.reopenHelp(id, (err) => dbRedirect(res, err, req.get('Referrer')));
  }),
);

app.get(
  '/c/:class_id/students',
  teacherOnly((req, res) => {
    const { class_id } = req.params;
    db.studentStats(class_id, (err, students) => {
      res.render('students.njk', { ...req.params, students });
    });
  }),
);

app.get(
  '/c/:class_id/members',
  teacherOnly((req, res) => {
    const { class_id } = req.params;
    db.memberStats(class_id, (err, members) => {
      res.render('members.njk', { ...req.params, members });
    });
  }),
);

app.get(
  '/users/:id',
  (req, res) => {
    const { id } = req.params;
    db.userById(id, (err1, requestedUser) => {
      db.userById(req.session.user.id, (err2, currentUser) => {
        if (requestedUser.id == currentUser.id || permissions.isAdmin(currentUser)) {
          res.render('user.njk', requestedUser);
        } else {
          res.sendStatus(401);
        }
      });
    });
  });

app.post(
  '/users/:id',
  (req, res) => {
    const { id } = req.params;
    db.userById(id, (err1, requestedUser) => {
      db.userById(req.session.user.id, (err2, currentUser) => {
        if (requestedUser.id == currentUser.id || permissions.isAdmin(currentUser)) {
          db.updateNameAndPronouns(requestedUser.id, req.body.preferredName, req.body.pronouns, (err3, user) => {
            res.render('user.njk', user);
          });
        } else {
          res.sendStatus(401);
        }
      });
    });
  });


////////////////////////////////////////////////////////////////////////////////
// Courses

app.get(
  '/classes',
  adminOnly(async (req, res) => {
    const oauth2client = oauth.oauth2client();
    oauth2client.setCredentials(req.session.auth);
    const courses = await allCourses(oauth2client);
    courses.forEach((c) => {
      c.fullName = fullClassName(c);
    });
    db.googleClassroomIds((err, ids) =>
      dbRender(res, err, 'classes.njk', { courses, googleIds: extractIds(ids) }),
    );
  }),
);

app.get(
  '/classes/:google_id/create',
  adminOnly(async (req, res) => {
    const { google_id } = req.params;

    const teacherId = req.session.user.id;
    // FIXME: I think it may be possible to just pass the auth data rather than
    // constructing an oauth2client object. Look into that later.
    const oauth2client = oauth.oauth2client();
    oauth2client.setCredentials(req.session.auth);
    const course = await oneCourse(oauth2client, google_id);

    const c = course.data;
    const students = await allStudents(oauth2client, c.id);
    const className = fullClassName(c);
    const classId = slugify(className);

    db.createClass(classId, teacherId, className, c.id, students, (err) =>
      dbRedirect(res, err, `/c/${classId}/students`),
    );
  }),
);

app.get(
  '/classes/:google_id/resync',
  adminOnly(async (req, res) => {
    const { google_id } = req.params;

    const oauth2client = oauth.oauth2client();
    oauth2client.setCredentials(req.session.auth);
    const students = await allStudents(oauth2client, google_id);

    db.classByGoogleId(google_id, (err, data) => {
      const classId = data.id;
      db.resyncClass(classId, students, (err) => dbRedirect(res, err, `/c/${classId}/students`));
    });
  }),
);

const fullClassName = (c) => (c.section ? `${c.name} - ${c.section}` : c.name);

const slugify = (s) => s.toLowerCase().replaceAll(/\W+/g, '-');

const extractIds = (googleIds) => googleIds.map((r) => r.google_id.toString(10));

const oneCourse = (auth, id) => classroom.courses.get({ id, auth });

const allCourses = async (oauth2client) => {
  const mainArgs = { teacherId: 'me', courseStates: ['ACTIVE'], auth: oauth2client };

  let pageToken;
  let results = [];
  do {
    /* eslint-disable no-await-in-loop */
    const args = pageToken ? { ...mainArgs, pageToken } : mainArgs;
    const res = await classroom.courses.list(args);
    results = results.concat(res.data.courses);
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  results.sort((a, b) => (fullClassName(a) < fullClassName(b) ? -1 : 1));
  return results;
};

const allStudents = async (oauth2client, courseId) => {
  const mainArgs = { courseId, auth: oauth2client };

  let pageToken;
  let results = [];
  do {
    /* eslint-disable no-await-in-loop */
    const args = pageToken ? { ...mainArgs, pageToken } : mainArgs;
    const res = await classroom.courses.students.list(args);
    results = results.concat(res.data.students);
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return results;
};

////////////////////////////////////////////////////////////////////////////////
// Start server

db.setup(() => {
  console.log('DB is set up.');
  app.listen(PORT, () => console.log(`Listening on port ${PORT}!`));
});

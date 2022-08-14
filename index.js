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
import groupEntries from './modules/journal.js';
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

env.addFilter('status', (h) => {
  if (h.discard_time !== null) {
    return 'Discarded';
  } else if (h.end_time !== null) {
    return 'Done';
  } else if (h.start_time !== null) {
    return 'In progress';
  } else {
    return 'On queue';
  }
});

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
// Journal

/*
 * Display the current user's journal with a form for new entries.
 */
app.get('/c/:class_id/journal', (req, res) => {
  const { class_id } = req.params;
  const { email } = req.session.user;
  db.journalWithPrompts(email, class_id, journalRenderer(req, res, true));
});

/*
 * Accept a POST of a new journal entry.
 */
app.post('/c/:class_id/journal', (req, res) => {
  const { class_id } = req.params;
  const { text } = req.body;
  const { email } = req.session.user;
  if (text) {
    db.addJournalEntry(email, class_id, text, (err) => dbRedirect(res, err, req.path));
  } else {
    const responses = promptResponses(req.body);
    db.addJournalEntries(email, class_id, responses, (err) => {
      dbRedirect(res, err, req.path);
    });
  }
});

/*
 * Display a particular user's journal with no form. Only allowed if the current
 * user is the owner of the journal or the teacher.
 */
app.get('/c/:class_id/journal/:id(\\d+)', (req, res) => {
  const { class_id } = req.params;
  const { user } = req.session;

  const renderJournal = journalRenderer(req, res, false);

  if (user.id === Number(req.params.id)) {
    // The authenticated user is requesting their own journal.
    db.journalWithPrompts(user.email, class_id, renderJournal);
  } else {
    // Otherwise need to see if authenticated user is the teacher.
    ifTeacher(req, res, () => {
      db.userById(req.params.id, (err, journalUser) => {
        if (err) {
          console.log(err);
          res.sendStatus(500);
        } else if (!journalUser) {
          res.sendStatus(404);
        } else {
          db.journalWithPrompts(journalUser.email, class_id, renderJournal);
        }
      });
    });
  }
});

const promptResponses = (body) =>
  Object.keys(body)
    .map((s) => s.match(/prompt-(\d+)/))
    .filter((m) => m)
    .map((m) => ({ promptId: Number(m[1]), text: body[m[0]] }));

const journalRenderer = (req, res, withForm) => (err, journal) => {
  dbRender(res, err, 'journal.njk', {
    ...req.params,
    days: groupEntries(journal.journal),
    prompts: journal.prompts,
    withForm,
  });
};

////////////////////////////////////////////////////////////////////////////////
// Prompts

app.post(
  '/c/:class_id/prompts',
  teacherOnly((req, res) => {
    const { class_id } = req.params;
    const { text } = req.body;
    db.createPrompt(class_id, text, (err) => dbRedirect(res, err, req.path));
  }),
);

app.get(
  '/c/:class_id/prompts',
  teacherOnly((req, res) => {
    const { class_id } = req.params;
    db.allPromptsForClass(class_id, (err, prompts) => {
      const open = openPrompts(prompts);
      const unique = uniquePrompts(prompts);
      dbRender(res, err, 'prompts.njk', { ...req.params, open, unique });
    });
  }),
);

app.get(
  '/c/:class_id/prompts/:id(\\d+)/close',
  teacherOnly((req, res) => {
    const { class_id, id } = req.params;
    db.closePrompt(id, (err) => dbRedirect(res, err, `/c/${class_id}/prompts`));
  }),
);

app.get(
  '/c/:class_id/prompts/:id(\\d+)/again',
  teacherOnly((req, res) => {
    const { class_id, id } = req.params;
    db.promptAgain(id, (err) => dbRedirect(res, err, `/c/${class_id}/prompts`));
  }),
);

const openPrompts = (prompts) => prompts.filter((p) => p.closed_at === null);

const uniquePrompts = (prompts) => {
  const seen = {};
  const unique = [];
  prompts.forEach((p) => {
    if (!seen[p.text]) {
      seen[p.text] = true;
      unique.push(p);
    }
  });
  return unique;
};

////////////////////////////////////////////////////////////////////////////////
// Pages

app.get('/', (req, res) => {
  const { email } = req.session.user;
  db.classMemberships(email, (err, memberships) => {
    dbRender(res, err, 'index.njk', { memberships });
  });
});

app.get('/c/:class_id/help', (req, res) => {
  res.render('help-form.njk', req.params);
});

app.post('/c/:class_id/help', (req, res) => {
  const { class_id } = req.params;
  const { problem, tried } = req.body;
  const { email } = req.session.user;
  db.requestHelp(email, class_id, problem, tried, (err) => {
    if (err) {
      console.log(err);
      res.sendStatus(500);
    } else {
      res.redirect(`up-next`);
    }
  });
});

app.get('/c/:class_id/help/:id(\\d+)', (req, res) => {
  const { id, class_id } = req.params;
  db.getHelp(id, (err, item) => dbRender(res, err, 'help.njk', { id, class_id, item }));
});

app.get('/c/:class_id/journal/:id', (req, res) => {
  res.sendFile(path.join(DIRNAME, 'public/journal/show.html'));
});

app.get('/c/:class_id/up-next', (req, res) => {
  const { class_id } = req.params;
  db.queue(class_id, (err, queue) => dbRender(res, err, 'up-next.njk', { class_id, queue }));
});

app.get('/c/:class_id/in-progress', (req, res) => {
  const { class_id } = req.params;
  db.inProgress(class_id, (err, queue) =>
    dbRender(res, err, 'in-progress.njk', { class_id, queue }),
  );
});

app.get('/c/:class_id/done', (req, res) => {
  const { class_id } = req.params;
  db.done(class_id, (err, queue) => dbRender(res, err, 'done.njk', { class_id, queue }));
});

app.get('/c/:class_id/discarded', (req, res) => {
  const { class_id } = req.params;
  db.discarded(class_id, (err, queue) => dbRender(res, err, 'discarded.njk', { class_id, queue }));
});

////////////////////////////////////////////////////////////////////////////////
// Help items state changes.

// FIXME: should perhaps pass req.session.user.email to all the state changes
// and log the changes, especially if we're going to let students move things on
// the queue.

app.get(
  '/c/:class_id/help/:id/take',
  helperOnly((req, res) => {
    const { class_id, id } = req.params;
    db.take(req.params.id, req.session.user.email, (err) =>
      dbRedirect(res, err, `/c/${class_id}/help/${id}`),
    );
  }),
);

app.get(
  '/c/:class_id/help/:id/requeue',
  helperOnly((req, res) => {
    const { class_id, id } = req.params;
    db.requeueHelp(req.params.id, (err) => dbRedirect(res, err, `/c/${class_id}/help/${id}`));
  }),
);

app.get(
  '/c/:class_id/help/:id/done',
  helperOnly((req, res) => {
    const { class_id, id } = req.params;
    db.finishHelp(req.params.id, (err) => dbRedirect(res, err, `/c/${class_id}/help/${id}`));
  }),
);

app.get(
  '/c/:class_id/help/:id/reopen',
  helperOnly((req, res) => {
    const { class_id, id } = req.params;
    db.reopenHelp(req.params.id, (err) => dbRedirect(res, err, `/c/${class_id}/help/${id}`));
  }),
);

app.get(
  '/c/:class_id/help/:id/discard',
  helperOnly((req, res) => {
    const { class_id, id } = req.params;
    db.discardHelp(req.params.id, (err) => dbRedirect(res, err, `/c/${class_id}/help/${id}`));
  }),
);

app.get('/c/:class_id', (req, res) => {
  const { class_id } = req.params;
  db.getClass(class_id, (err, clazz) => {
    if (err) {
      console.log(err);
      res.sendStatus(500);
    } else {
      res.render('class.njk', clazz);
    }
  });
});

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
  '/users/:id',
  adminOnly((req, res) => {
    const { id } = req.params;
    db.userById(id, (err, user) => {
      res.render('user.njk', user);
    });
  }),
);

////////////////////////////////////////////////////////////////////////////////
// Courses

app.get(
  '/classes',
  adminOnly(async (req, res) => {
    const oauth2client = oauth.oauth2client();
    oauth2client.setCredentials(req.session.auth);
    const courses = await allCourses(oauth2client);
    db.googleClassroomIds((err, ids) =>
      dbRender(res, err, 'classes.njk', { courses, googleIds: extractIds(ids) }),
    );
  }),
);

app.get(
  '/classes/:google_id',
  adminOnly(async (req, res) => {
    const { google_id } = req.params;
    const { email } = req.session.user;
    const oauth2client = oauth.oauth2client();
    oauth2client.setCredentials(req.session.auth);
    const course = await oneCourse(oauth2client, google_id);

    const c = course.data;
    const students = await allStudents(oauth2client, c.id);
    const classId = c.name.toLowerCase().replaceAll(/\W+/g, '-');
    const teacherEmail = email;

    db.loadClass(classId, teacherEmail, c.name, c.id, students, (err) =>
      dbRedirect(res, err, `/c/${classId}/students`),
    );
  }),
);

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

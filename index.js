import 'dotenv/config';
import cookieParser from 'cookie-parser';
import express from 'express';
import nunjucks from 'nunjucks';
import path from 'path';
import { fileURLToPath } from 'url';
import markdownFilter from 'nunjucks-markdown-filter';

import DB from './modules/storage.js';
import requireLogin from './modules/require-login.js';
import Permissions from './modules/permissions.js';
import { groupEntries } from './modules/journal.js';

const FILENAME = fileURLToPath(import.meta.url);
const DIRNAME = path.dirname(FILENAME);

const { PORT, SECRET } = process.env;

const noAuthRequired = {
  '/logout': true,
  '/auth': true,
  '/health.html': true,
  '/health': true,
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
  const renderJournal = (err, journal) => {
    dbRender(res, err, 'journal.njk', {
      ...req.params,
      days: groupEntries(journal),
      withForm: true,
    });
  };
  db.journalFor(email, class_id, renderJournal);
});

/*
 * Accept a POST of a new journal entry.
 */
app.post('/c/:class_id/journal', (req, res) => {
  const { class_id } = req.params;
  const { text, prompt } = req.body;
  const { email } = req.session.user;
  db.addJournalEntry(email, class_id, text, prompt || null, (err) =>
    dbRedirect(res, err, req.path),
  );
});

/*
 * Display a particular user's journal with no form. Only allowed if the current
 * user is the owner of the journal or the teacher.
 */
app.get('/c/:class_id/journal/:id(\\d+)', (req, res) => {
  const { class_id } = req.params;
  const { user } = req.session;

  const renderJournal = (err, journal) => {
    dbRender(res, err, 'journal.njk', {
      ...req.params,
      days: groupEntries(journal),
      withForm: false,
    });
  };

  if (user.id === Number(req.params.id)) {
    // The authenticated user is requesting their own journal.
    db.journalFor(user.email, class_id, renderJournal);
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
          db.journalFor(journalUser.email, class_id, renderJournal);
        }
      });
    });
  }
});

app.get('/api/journals', (req, res) => {
  const { after, before } = req.query;
  const start = after ? Number(after) : null;
  const end = before ? Number(before) : null;
  db.journalsBetween(start, end, jsonSender(res));
});

////////////////////////////////////////////////////////////////////////////////
// Prompts

app.post(
  '/c/:class_id/prompts',
  teacherOnly((req, res) => {
    const { title, text } = req.body;
    db.ensurePromptText(title, text, (err) => {
      if (err) {
        console.log(err);
        res.sendStatus(500);
      } else {
        res.redirect('/prompts');
      }
    });
  }),
);

app.get(
  '/c/:class_id/prompts',
  teacherOnly((req, res) => {
    db.allPrompts((err, prompts) => {
      res.render('prompts.njk', { prompts });
    });
  }),
);

////////////////////////////////////////////////////////////////////////////////
// Start working on a request for help.

app.get('/api/user', (req, res) => {
  console.log(req.session.user);
  db.user(req.session.user.email, jsonSender(res));
});

////////////////////////////////////////////////////////////////////////////////
// Pages

app.get(
  '/create-class',
  adminOnly((req, res) => {
    res.render('create-class-form.njk');
  }),
);

app.post('/create-class', (req, res) => {
  const { id, name, google_id } = req.body;
  console.log(req.body);
  db.createClass(id, name, google_id || null, (err) => {
    if (err) {
      console.log(err);
      res.sendStatus(500);
    } else {
      res.redirect(`/c/${id}/`);
    }
  });
});

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

app.get('/c/:class_id/join', (req, res) => {
  const { class_id } = req.params;
  db.getClass(class_id, (err, clazz) => {
    if (err) {
      console.log(err);
      res.sendStatus(500);
    } else {
      res.render('join-class-form.njk', clazz);
    }
  });
});

app.post('/c/:class_id/join', (req, res) => {
  const { class_id } = req.params;

  // FIXME: should actually check this. Or get rid of it if we're just going to preload the roster.
  // const { join_code } = req.body;

  const { email } = req.session.user;
  db.joinClass(class_id, email, (err) => {
    if (err) {
      console.log(err);
      res.sendStatus(500);
    } else {
      res.redirect(`/c/${class_id}`);
    }
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
  console.log('here');
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

app.get(
  '/c/:class_id/students',
  teacherOnly((req, res) => {
    const { class_id } = req.params;
    db.studentStats(class_id, (err, students) => {
      console.log(students);
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
// Start server

db.setup(() => {
  console.log('DB is set up.');
  app.listen(PORT, () => console.log(`Listening on port ${PORT}!`));
});

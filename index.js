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
const adminOnly = permissions.route(permissions.isAdmin)

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

app.get('/health', (req, res) => res.send('Ok.'));

app.get('/logout', (req, res) => {
  login.logout(res);
  res.send('<html><body><p>Logged out. <a href="/">Start over</a></p></html>');
});

app.get('/auth', (req, res) => {
  login.finish(req, res);
});

////////////////////////////////////////////////////////////////////////////////
// Requests for help

/*
 * Make a new request.
 */
app.post('/api/:class_id/help', (req, res) => {
  const { class_id } = req.params;
  const { problem, tried } = req.body;
  const { email, name } = req.session.user;
  db.requestHelp(email, class_id, problem, tried, jsonSender(res));
});

/*
 * Fetch an existing request.
 */
app.get('/api/help/:id', (req, res) => {
  db.getHelp(req.params.id, jsonSender(res));
});

/*
 * Take a specific item from the queue and start helping.
 */
app.get(
  '/api/:class_id/help/:id/take',
  helperOnly((req, res) => {
    db.take(req.params.id, req.session.user.email, jsonSender(res));
  }),
);

/*
 * Take the item.
 */
app.patch(
  '/api/:class_id/help/:id/take',
  helperOnly(
  (req, res) => {
    db.take(req.params.id, req.session.user.email, jsonSender(res));
  }),
);

/*
 * Close the given help record.
 */
app.patch(
  '/api/help/:id/finish',
  helperOnly((req, res) => {
    db.finishHelp(req.params.id, jsonSender(res));
  }),
);

/*
 * Put the given help item back on the queue.
 */
app.patch(
  '/api/help/:id/requeue',
  helperOnly((req, res) => {
    db.requeueHelp(req.params.id, jsonSender(res));
  }),
);

/*
 * Put the given help item back into in-progress from done.
 */
app.patch(
  '/api/help/:id/reopen',
  helperOnly((req, res) => {
    db.reopenHelp(req.params.id, jsonSender(res));
  }),
);

/*
 * Discard the help item.
 */
app.patch(
  '/api/help/:id/discard',
  helperOnly((req, res) => {
    db.discardHelp(req.params.id, jsonSender(res));
  }),
);

////////////////////////////////////////////////////////////////////////////////
// Journal

/*
 * Accept a POST of a new journal entry.
 */
app.post('/journal', (req, res) => {
  const { text, prompt } = req.body;
  const { email } = req.session.user;
  db.addJournalEntry(email, text, prompt || null, (err) => {
    if (err) {
      console.log(err);
      res.sendStatus(500);
    } else {
      res.redirect('/journal');
    }
  });
});

/*
 * Get the whole journal of the logged in user.
 */
app.get('/api/journal', (req, res) => {
  const { email } = req.session.user;
  db.journalFor(email, jsonSender(res));
});

/*
 * Get an arbitrary journal. User must be owner or teacher.
 */
app.get('/api/journal/:id', (req, res) => {
  const { user } = req.session;
  if (user.id === Number(req.params.id)) {
    // The authenticated user is requesting their own journal.
    db.journalFor(user.email, jsonSender(res));
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
          db.journalFor(journalUser.email, jsonSender(res));
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

/*
 * Take the next item on the queue and start helping.
 */
app.get(
  '/api/next',
  helperOnly((req, res) => {
    db.next(req.session.user.email, jsonSender(res));
  }),
);

app.get('/api/user', (req, res) => {
  console.log(req.session.user);
  db.user(req.session.user.email, jsonSender(res));
});

////////////////////////////////////////////////////////////////////////////////
// Bulk queries

/*
 * Get the queue of requests for help that have not been picked up yet.
 */
app.get('/api/:class_id/queue', (req, res) => {
  const { class_id } = req.params;
  db.queue(class_id, jsonSender(res));
});

/*
 * Get the requests that are currently being helped.
 */
app.get('/api/:class_id/in-progress', (req, res) => {
  const { class_id } = req.params;
  db.inProgress(class_id, jsonSender(res));
});

/*
 * Get the requests that have been helped and finished.
 */
app.get('/api/:class_id/done', (req, res) => {
  const { class_id } = req.params;
  db.done(class_id, jsonSender(res));
});

app.get('/api/:class_id/discarded', (req, res) => {
  db.discarded(jsonSender(res));
});

////////////////////////////////////////////////////////////////////////////////
// Pages

app.get('/create-class', adminOnly((req, res) => {
  res.render('create-class-form.njk');
}));

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
  const { join_code } = req.body

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
  const { class_id } = req.params;
  res.render('help-form.njk');
});

app.post('/c/:class_id/help', (req, res) => {
  const { class_id } = req.params;
  const { problem, tried } = req.body;
  const { email, name } = req.session.user;
  db.requestHelp(email, class_id, problem, tried, (err) => {
    if (err) {
      console.log(err);
      res.sendStatus(500);
    } else {
      res.redirect(`up-next`);
    }
  });
});


app.get('/c/:class_id/help/:id', (req, res) => {
  // Can't use help/index.html because that's the form.
  res.sendFile(path.join(DIRNAME, 'public/help/show.html'));
});

app.get('/c/:class_id/journal/:id', (req, res) => {
  res.sendFile(path.join(DIRNAME, 'public/journal/show.html'));
});

app.get('/c/:class_id/old-up-next', (req, res) => {
  const { class_id } = req.params;
  res.render('old-up-next.njk', { class_id });
});

app.get('/c/:class_id/up-next', (req, res) => {
  const { class_id } = req.params;
  db.queue(class_id, (err, queue) => {
    if (err) {
      console.log(err);
      res.sendStatus(500);
    } else {
      res.render('up-next.njk', { class_id, queue });
    }
  });
});

app.get('/c/:class_id/in-progress', (req, res) => {
  const { class_id } = req.params;
  res.render('in-progress.njk', { class_id });
});

app.get('/c/:class_id/done', (req, res) => {
  const { class_id } = req.params;
  res.render('done.njk', { class_id });
});

app.get('/c/:class_id/discarded', (req, res) => {
  const { class_id } = req.params;
  res.render('discarded.njk', { class_id });
});

app.get(
  '/c/:class_id/users',
  teacherOnly((req, res) => {
    const { class_id } = req.params;
    db.userStats((err, users) => {
      res.render('users.njk', { users });
    });
  }),
);

app.get(
  '/c/:class_id/students',
  teacherOnly((req, res) => {
    const { class_id } = req.params;
    db.studentStats(class_id, (err, students) => {
      console.log(students);
      res.render('students.njk', { students });
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

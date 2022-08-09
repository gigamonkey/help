import 'dotenv/config';
import cookieParser from 'cookie-parser';
import express from 'express';
import nunjucks from 'nunjucks';
import path from 'path';
import { fileURLToPath } from 'url';

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

nunjucks.configure('views', {
  autoescape: true,
  express: app,
});

// Permission schemes.
const isTeacher = permissions.oneOf('teacher');
const isHelper = permissions.oneOf('teacher', 'helper');

// Route permission handlers
const teacherOnly = permissions.route(isTeacher);
const helperOnly = permissions.route(isHelper);

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
app.post('/api/help', (req, res) => {
  const { problem, tried } = req.body;
  const { email, name } = req.session.user;
  db.requestHelp(email, name || null, problem, tried, jsonSender(res));
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
  '/api/help/:id/take',
  helperOnly((req, res) => {
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
  '/prompts',
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
  '/prompts',
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
app.get('/api/queue', (req, res) => {
  db.queue(jsonSender(res));
});

/*
 * Get the requests that are currently being helped.
 */
app.get('/api/in-progress', (req, res) => {
  db.inProgress(jsonSender(res));
});

/*
 * Get the requests that have been helped and finished.
 */
app.get('/api/done', (req, res) => {
  db.done(jsonSender(res));
});

app.get('/api/discarded', (req, res) => {
  db.discarded(jsonSender(res));
});

////////////////////////////////////////////////////////////////////////////////
// Pages

app.post('/help', (req, res) => {
  const { problem, tried } = req.body;
  const { email, name } = req.session.user;
  db.requestHelp(email, name || null, problem, tried, () => res.redirect('/up-next'));
});

app.get('/help/:id', (req, res) => {
  // Can't use help/index.html because that's the form.
  res.sendFile(path.join(DIRNAME, 'public/help/show.html'));
});

app.get('/journal/:id', (req, res) => {
  res.sendFile(path.join(DIRNAME, 'public/journal/show.html'));
});

app.get(
  '/users',
  teacherOnly((req, res) => {
    db.userStats((err, users) => {
      res.render('users.njk', { users });
    });
  }),
);

app.get(
  '/users/:id',
  teacherOnly((req, res) => {
    const { id } = req.params;
    console.log(id);
    db.userById(id, (err, user) => {
      console.log(user);
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

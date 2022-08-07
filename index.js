import 'dotenv/config';
import cookieParser from 'cookie-parser';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import DB from './modules/storage.js';
import requireLogin from './modules/require-login.js';

const FILENAME = fileURLToPath(import.meta.url);
const DIRNAME = path.dirname(FILENAME);

const { PORT, SECRET } = process.env;

const noAuthRequired = {
  '/logout': true,
  '/auth': true,
  '/health.html': true,
};

const db = new DB('help.db');
const app = express();
const login = requireLogin(noAuthRequired, db, SECRET);

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
  } else {
    res.type('json');
    res.send(JSON.stringify(data, null, 2));
  }
};

app.get('/logout', (req, res) => {
  login.logout();
  res.send('<html><body><p>Logged out. <a href="/up-next">Start over</a></p></html>');
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
 * Close the given help record.
 */
app.patch('/api/help/:id/finish', (req, res) => {
  // FIXME: should be limited to helpers.
  db.finishHelp(req.params.id, req.body.comment, jsonSender(res));
});

/*
 * Put the given help item back on the queue.
 */
app.patch('/api/help/:id/requeue', (req, res) => {
  // FIXME: should be limited to helpers.
  db.requeueHelp(req.params.id, jsonSender(res));
});

/*
 * Put the given help item back into in-progress
 */
app.patch('/api/help/:id/reopen', (req, res) => {
  // FIXME: should be limited to helpers.
  db.reopenHelp(req.params.id, jsonSender(res));
});

/*
 * Take a specific item from the queue and start helping.
 */
app.get('/api/help/:id/take', (req, res) => {
  // FIXME: should be limited to helpers.
  db.take(req.params.id, req.session.user.email, jsonSender(res));
});

////////////////////////////////////////////////////////////////////////////////
// Journal

/*
 * Accept a POST of a new journal entry.
 */
app.post('/journal', (req, res) => {
  const { text } = req.body;
  const { email, name } = req.session.user;
  db.addJournalEntry(email, name || null, text, (err) => {
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
    console.log('Can see because it is my journal');
    // The authenticated user is requesting their own journal.
    db.journalFor(user.email, jsonSender(res));
  } else {
    // Otherwise need to see if authenticated user is the teacher. We need to go
    // to the db for info about the authenticated user that's not in the session
    // so it can be updated after the fact.
    db.user(user.email, (err, user) => {
      if (err) {
        console.log(err);
        res.sendStatus(500);
      } else if (user.role === 'teacher') {
        db.userById(req.params.id, (err, journalUser) => {
          if (err) {
            console.log(err);
            res.sendStatus(500);
          } else if (!journalUser) {
            console.log('No journal user');
            res.sendStatus(404);
          } else {
            console.log('Can see because I am the teacher.');
            db.journalFor(journalUser.email, jsonSender(res));
          }
        });
      } else {
        console.log('Not allowed to see this journal.');
        res.sendStatus(401);
      }
    });
  }
});

////////////////////////////////////////////////////////////////////////////////
// Start working on a request for help.

/*
 * Take the next item on the queue and start helping.
 */
app.get('/api/next', (req, res) => {
  // FIXME: should be limited to helpers.
  db.next(req.session.user.email, jsonSender(res));
});

app.get('/api/user', (req, res) => {
  console.log(req.session.user);
  db.user(req.session.user.email, (err, data) => {
    // FIXME: should abstract this pattern and use it everywhere.
    if (err) {
      console.log('Error getting user in /api/user');
      console.log(err);
      res.sendStatus(500);
    } else if (!data) {
      console.log('No user data');
      res.sendStatus(404);
    } else {
      jsonSender(res)(null, data);
    }
  });
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

////////////////////////////////////////////////////////////////////////////////
// Start server

app.listen(PORT, () => console.log(`Listening on port ${PORT}!`));

import 'dotenv/config';
import cookieParser from 'cookie-parser';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import DB from './modules/storage.js';
import oauth from './modules/oauth.js';
import { encrypt, decrypt } from './modules/crypto.js';

const FILENAME = fileURLToPath(import.meta.url);
const DIRNAME = path.dirname(FILENAME);

const { PORT, SECRET } = process.env;

// FIXME: this should come from the authenticated user.
const HELPER = 'Santa Claus';

const db = new DB('help.db');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Middleware that redirects all un-logged-in requests to Google sign in (except
// the endpoint used in the OAuth dance (/auth) and the endpoint for logging out.
app.use((req, res, next) => {
  console.log(`Original url: ${req.originalUrl}; Path: ${req.path}`);

  if (req.path === '/logout' || req.path === '/auth' || req.path === '/health.html') {
    next();
  } else if (!req.cookies.session) {
    console.log('No session. Logging in');
    const id = oauth.newSessionID();
    const state = `${oauth.newState()}:${req.originalUrl}`;
    req.session = { id, loggedIn: false };

    res.cookie('session', encrypt(req.session, SECRET));
    db.newSession(id, state, (err) => {
      if (err) throw err;
      res.redirect(oauth.url(state));
    });
  } else {
    console.log('Have session.');

    req.session = decrypt(req.cookies.session, SECRET);

    if (req.session.loggedIn) {
      next();
    } else {
      db.getSession(req.session.id, (err, data) => {
        if (err) throw err;
        res.redirect(oauth.url(data.state));
      });
    }
  }
});

app.use(express.static('public'));

const jsonSender = (res) => (err, data) => {
  if (err) {
    res.send(`Whoops ${err}`);
  } else {
    res.type('json');
    res.send(JSON.stringify(data, null, 2));
  }
};

app.get('/logout', (req, res) => {
  res.clearCookie('session');
  res.send('<html><body><p>Logged out. <a href="/">Start over</a></p></html>');
});

app.get('/auth', async (req, res) => {
  // In theory we were redirected here by Google but also in theory an attacker
  // could just hit this endpoint. So we need to check that the state associated
  // with the session (which an attacker wouldn't know) is the same as what came
  // in the query params. (They'd still need to know the right code so it's not
  // clear what kind of attack this is. But the code at least went over the wire
  // whereas the state did not.)

  const authData = await oauth.getToken(req.query.code);
  const session = decrypt(req.cookies.session, SECRET);

  db.getSession(session.id, (err, dbSession) => {
    if (err) throw err;

    const { state } = req.query;
    if (dbSession.state !== state) {
      throw new Error(`Mismatched state: db: ${dbSession.state}; query: ${state}`);
    }

    const { name, email } = JSON.parse(atob(authData.id_token.split('.')[1]));
    db.setSessionUser(session.id, email, (err) => {
      if (err) throw err;
      res.cookie('session', encrypt({ ...session, loggedIn: true, user: { name, email } }, SECRET));
      res.redirect(state.split(':')[1]);
    });
  });
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
  db.finishHelp(req.params.id, req.body.comment, jsonSender(res));
});

app.patch('/api/help/:id/requeue', (req, res) => {
  db.requeueHelp(req.params.id, jsonSender(res));
});

app.patch('/api/help/:id/reopen', (req, res) => {
  db.reopenHelp(req.params.id, req.body.comment, jsonSender(res));
});

////////////////////////////////////////////////////////////////////////////////
// Start working on a request for help.

/*
 * Take the next item on the queue and start helping.
 */
app.get('/api/next', (req, res) => {
  db.next(HELPER, jsonSender(res));
});

/*
 * Take a specific item from the queue and start helping.
 */
app.get('/api/take/:requestID', (req, res) => {
  db.take(req.params.requestID, HELPER, jsonSender(res));
});

app.get('/api/role', (req, res) => {
  // FIXME: should be stored in db.
  const role = req.session.user.email === 'peterseibel@berkeley.net' ? 'helper' : 'student';
  jsonSender(res)(null, { role });
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
app.get('/api/helped', (req, res) => {
  db.helped(jsonSender(res));
});

////////////////////////////////////////////////////////////////////////////////
// Pages

app.post('/help', (req, res) => {
  const { problem, tried } = req.body;
  const { email, name } = req.session.user;
  db.requestHelp(email, name || null, problem, tried, () => res.redirect('/'));
});

app.get('/help/:id', (req, res) => {
  res.sendFile(path.join(DIRNAME, 'public/help/show.html'));
});

app.get('/in-progress', (req, res) => {
  res.sendFile(path.join(DIRNAME, 'public/in-progress.html'));
});

app.get('/done', (req, res) => {
  res.sendFile(path.join(DIRNAME, 'public/done.html'));
});

////////////////////////////////////////////////////////////////////////////////
// Start server

app.listen(PORT, () => console.log(`App is listening on port ${PORT}!`));

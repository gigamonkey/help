import DB from './modules/storage.js';
import crypto from 'crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import 'dotenv/config';

const { CLIENT_ID, CLIENT_SECRET, PORT, REDIRECT_URL } = process.env;

const BASE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// FIXME: this should come from the authenticated user.
const HELPER = 'Santa Claus';

const db = new DB('help.db');
const app = express();

app.use(express.json());
app.use(express.static('public'));
app.use(cookieParser());

const randomString = () => {
  const array = new Uint32Array(4);
  crypto.getRandomValues(array);
  return [...array]
    .map((n) => n.toString(16).padStart(8, 0))
    .join('-')
    .toLowerCase();
};

const params = {
  // FIXME: could possibly use nonce and hd as well
  client_id: CLIENT_ID,
  response_type: 'code',
  scope: 'openid email',
  redirect_uri: REDIRECT_URL,
};

const url = (base, params, state) => `${base}?${formurlencoded({ ...params, state })}`;

const formurlencoded = (data) =>
  Object.entries(data)
    .map((kv) => kv.map(encodeURIComponent).join('='))
    .join('&');

const jsonSender = (res) => (err, data) => {
  if (err) {
    res.send(`Whoops ${err}`);
  } else {
    res.type('json');
    res.send(JSON.stringify(data, null, 2));
  }
};

app.get('/login', (req, res) => {
  if (!req.cookies.session) {
    const sessionID = randomString();
    const oauthState = randomString();
    res.cookie('session', sessionID);
    db.newSession(sessionID, oauthState, (err, data) => {
      if (err) throw err;
      res.redirect(url(BASE_AUTH_URL, params, oauthState));
    });
  } else {
    db.getSession(req.cookies.session, (err, data) => {
      if (err) throw err;
      res.send(`Already logged in as ${data.user}`);
    });
  }
});

app.get('/logout', (req, res) => {
  res.clearCookie('session');
  res.send('Logged out.');
});

app.get('/auth', async (req, res) => {
  const params = new URLSearchParams({
    code: req.query.code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: 'http://localhost:3000/auth',
    grant_type: 'authorization_code',
  });

  const resp = await fetch(TOKEN_URL, { method: 'POST', body: params });
  const data = await resp.json();
  const email = JSON.parse(atob(data.id_token.split('.')[1])).email;

  db.setSessionUser(req.cookies.session, email, (err, data) => {
    res.redirect('/login');
  });
});

////////////////////////////////////////////////////////////////////////////////
// Requests for help

/*
 * Make a new request.
 */
app.post('/help', (req, res) => {
  const { who, problem, tried } = req.body;
  db.requestHelp(who, problem, tried, jsonSender(res));
});

/*
 * Fetch an existing request.
 */
app.get('/help/:id', (req, res) => {
  db.getHelp(req.params.id, jsonSender(res));
});

/*
 * Close the given help record.
 */
app.patch('/help/:id/finish', (req, res) => {
  db.finishHelp(req.params.id, req.body.comment, jsonSender(res));
});

////////////////////////////////////////////////////////////////////////////////
// Start working on a request for help.

/*
 * Take the next item on the queue and start helping.
 */
app.get('/next', (req, res) => {
  db.next(HELPER, jsonSender(res));
});

/*
 * Take a specific item from the queue and start helping.
 */
app.get('/take/:requestID', (req, res) => {
  db.take(req.params.requestID, HELPER, jsonSender(res));
});

////////////////////////////////////////////////////////////////////////////////
// Bulk queries

/*
 * Get the queue of requests for help that have not been picked up yet.
 */
app.get('/queue', (req, res) => {
  db.queue(jsonSender(res));
});

/*
 * Get the requests that are currently being helped.
 */
app.get('/in-progress', (req, res) => {
  db.inProgress(jsonSender(res));
});

/*
 * Get the requests that have been helped and finished.
 */
app.get('/helped', (req, res) => {
  db.helped(jsonSender(res));
});

////////////////////////////////////////////////////////////////////////////////
// Start server

app.listen(PORT, () => console.log(`App is listening on port ${PORT}!`));

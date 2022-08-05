import express from 'express';
import cookieParser from 'cookie-parser';
import DB from './modules/storage.js';
import oauth from './modules/oauth.js';
import 'dotenv/config';

const { PORT } = process.env;

// FIXME: this should come from the authenticated user.
const HELPER = 'Santa Claus';

const db = new DB('help.db');
const app = express();

app.use(express.json());
app.use(cookieParser());


app.use((req, res, next) => {
  console.log(`Original url: ${req.originalUrl}; Path: ${req.path}`);

  // FIXME: this isn't quite right as the api endpoints should still require authentication.
  if (req.path === '/logout' || req.path === '/auth' || req.path.startsWith('/api/')) {
    next();

  } else {
    if (!req.cookies.session) {
      console.log('No session. Logging in');
      const sessionID = oauth.newSessionID();
      const state = `${oauth.newState()}:${req.originalUrl}`;
      res.cookie('session', sessionID);
      db.newSession(sessionID, state, (err) => {
        if (err) throw err;
        res.redirect(oauth.url(state));
      });
    } else {
      console.log('Have session.');
      db.getSession(req.cookies.session, (err, data) => {
        if (err) throw err;
        console.log(`Logged in as ${data.user}`);
        req.user = data.user;
        next();
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
  res.send('Logged out.');
});

app.get('/auth', async (req, res) => {
  const data = await oauth.getToken(req.query.code);
  const query = req.query;
  console.log({ data, query });
  const { email } = JSON.parse(atob(data.id_token.split('.')[1]));
  const { state } = query;
  db.setSessionUser(req.cookies.session, email, (err) => {
    if (err) throw err;
    res.redirect(state.split(':')[1]);
  });
});

////////////////////////////////////////////////////////////////////////////////
// Requests for help

/*
 * Make a new request.
 */
app.post('/api/help', (req, res) => {
  const { who, problem, tried } = req.body;
  db.requestHelp(who, problem, tried, jsonSender(res));
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
// Start server

app.listen(PORT, () => console.log(`App is listening on port ${PORT}!`));

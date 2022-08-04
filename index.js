import express from 'express';
import DB from './modules/storage.js';

// FIXME: this should come from the authenticated user.
const HELPER = 'Santa Claus';

const app = express();

app.use(express.json());

const db = new DB('help.db');

const jsonSender = (res) => (err, data) => {
  if (err) {
    res.send(`Whoops ${err}`);
  } else {
    res.type('json');
    res.send(JSON.stringify(data, null, 2));
  }
};

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
 * Fetch ann existing request.
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

app.listen(3000, () => console.log(`App is listening on port 3000!`));

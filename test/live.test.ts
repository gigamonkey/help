import assert from 'node:assert';
import { after, before, test } from 'node:test';
import { Client, startServer, type TestServer } from './harness.ts';

/*
 * End-to-end SSE: subscribe to a class's live-update stream, change the
 * queue as other users, and assert the notify-only events arrive.
 */

let srv: TestServer;

before(async () => {
  srv = await startServer();
});

after(() => srv?.stop());

/*
 * Read from the stream until the accumulated text matches the pattern, or
 * the timeout cancels the read (leaving the text unmatched for the
 * caller's assertion).
 */
const readUntil = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  pattern: RegExp,
  timeoutMillis: number,
): Promise<string> => {
  const decoder = new TextDecoder();
  let text = '';
  const timeout = setTimeout(() => reader.cancel(), timeoutMillis);
  try {
    while (!pattern.test(text)) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    clearTimeout(timeout);
  }
  return text;
};

test('queue changes reach subscribers', async () => {
  const watcher = new Client(srv.base);
  const student = new Client(srv.base);
  const helper = new Client(srv.base);
  await watcher.login('teacher1');
  await student.login('student1');
  await helper.login('helper1');

  const stream = await watcher.get('/c/apcs/events');
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get('content-type') ?? '', /text\/event-stream/);
  assert.ok(stream.body, 'stream has a body');
  const reader = stream.body.getReader();

  // The subscription is registered before the headers go out, so having
  // the response in hand means the broadcasts below can't race it.
  const posted = await fetch(`${srv.base}/c/apcs/help`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: student.cookieHeader(),
    },
    body: 'problem=Live+test+question',
  });
  assert.equal(posted.status, 302);
  await posted.body?.cancel();
  assert.match(await readUntil(reader, /event: queue/, 5000), /event: queue/, 'request event');

  // Closing an item broadcasts too (fixture rowid 1 is an open request).
  assert.equal(await helper.status('/c/apcs/help/1/done'), 302);
  assert.match(await readUntil(reader, /event: queue/, 5000), /event: queue/, 'close event');

  await reader.cancel();
});

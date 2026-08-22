import assert from 'node:assert';
import { after, before, test } from 'node:test';
import { Client, startServer, type TestServer } from './harness.ts';

/*
 * The permissions matrix: spawn the real server (see harness.ts), log in
 * as each persona, and assert the URL x persona status matrix.
 */

let srv: TestServer;
let base: string;

const personas = ['anon', 'student', 'helper', 'teacher', 'outsider', 'admin', 'owner'] as const;
type Persona = (typeof personas)[number];

const loginIds: Record<Persona, string | null> = {
  anon: null,
  student: 'student1',
  helper: 'helper1',
  teacher: 'teacher1',
  outsider: 'outsider1',
  admin: 'admin1',
  owner: 'owner1',
};

const clients = {} as Record<Persona, Client>;

before(async () => {
  srv = await startServer();
  base = srv.base;

  for (const p of personas) {
    clients[p] = new Client(base);
    const id = loginIds[p];
    if (id) {
      await clients[p].login(id);
    }
  }
});

after(() => srv?.stop());

/*
 * 302 for anon is the redirect to /dev/login (to Google sign-in in real
 * life). 401 is a permission denial. These assert today's behavior,
 * including that any logged-in user can view any class's queue pages.
 */
const matrix: [string, Record<Persona, number>][] = [
  [
    '/',
    { anon: 302, student: 200, helper: 200, teacher: 200, outsider: 200, admin: 200, owner: 200 },
  ],
  [
    '/c/apcs/help',
    { anon: 302, student: 200, helper: 200, teacher: 200, outsider: 200, admin: 200, owner: 200 },
  ],
  [
    '/c/apcs/queue',
    { anon: 302, student: 200, helper: 200, teacher: 200, outsider: 200, admin: 200, owner: 200 },
  ],
  [
    '/c/apcs/done',
    { anon: 302, student: 200, helper: 200, teacher: 200, outsider: 200, admin: 200, owner: 200 },
  ],
  // The SSE stream is in the same regime as the queue pages it refreshes.
  [
    '/c/apcs/events',
    { anon: 302, student: 200, helper: 200, teacher: 200, outsider: 200, admin: 200, owner: 200 },
  ],
  // The room queue page (and its stream) are in the same any-logged-in-user
  // regime as the class queue pages; a 200 is time-independent because the
  // no-class-in-session state is still a 200.
  [
    '/r/303',
    { anon: 302, student: 200, helper: 200, teacher: 200, outsider: 200, admin: 200, owner: 200 },
  ],
  [
    '/r/303/events',
    { anon: 302, student: 200, helper: 200, teacher: 200, outsider: 200, admin: 200, owner: 200 },
  ],
  [
    '/c/apcs/students',
    { anon: 302, student: 401, helper: 401, teacher: 200, outsider: 401, admin: 401, owner: 401 },
  ],
  [
    '/c/apcs/members',
    { anon: 302, student: 401, helper: 401, teacher: 200, outsider: 401, admin: 401, owner: 401 },
  ],
  [
    '/c/apcs/settings',
    { anon: 302, student: 401, helper: 401, teacher: 200, outsider: 401, admin: 401, owner: 401 },
  ],
  // student1's own profile: self or admin only.
  [
    '/users/student1',
    { anon: 302, student: 200, helper: 401, teacher: 401, outsider: 401, admin: 200, owner: 200 },
  ],
  [
    '/c/nosuchclass',
    { anon: 302, student: 404, helper: 404, teacher: 404, outsider: 404, admin: 404, owner: 404 },
  ],
];

for (const [url, expected] of matrix) {
  test(`matrix ${url}`, async () => {
    for (const p of personas) {
      assert.equal(await clients[p].status(url), expected[p], `${p} ${url}`);
    }
  });
}

/*
 * Help-item state changes. Fixture rowids: 1 = open, student1's; 2 = open,
 * student2's; 3 = closed, helper1's.
 */
test('closing: stranger and outsider denied, requester and helper allowed', async () => {
  assert.equal(await clients.student.status('/c/apcs/help/2/done'), 401, 'done-by-stranger');
  assert.equal(await clients.outsider.status('/c/apcs/help/1/done'), 401, 'done-by-outsider');
  assert.equal(await clients.admin.status('/c/apcs/help/1/done'), 401, 'done-by-non-member-admin');
  assert.equal(await clients.student.status('/c/apcs/help/1/done'), 302, 'done-by-requester');
  assert.equal(await clients.helper.status('/c/apcs/help/2/done'), 302, 'done-by-helper');
});

test('reopening: helpers and teachers only', async () => {
  assert.equal(await clients.student.status('/c/apcs/help/3/reopen'), 401);
  assert.equal(await clients.outsider.status('/c/apcs/help/3/reopen'), 401);
  assert.equal(await clients.helper.status('/c/apcs/help/3/reopen'), 302);
  assert.equal(await clients.teacher.status('/c/apcs/help/3/reopen'), 302);
});

test('closed items show up on the done page', async () => {
  // By now the closing test has closed items 1 and 2, and the reopening
  // test has reopened item 3.
  const res = await clients.teacher.get('/c/apcs/done');
  const body = await res.text();
  assert.match(body, /Open request from student1/);
  assert.match(body, /Open request from student2/);
  assert.doesNotMatch(body, /Closed request from helper1/);
});

test('homepage class list is sorted by period', async () => {
  // Intro CS is Period 2, AP CS is Period 4 (see seed/fixtures.ts), so
  // period order is the reverse of alphabetical.
  const page = await (await clients.teacher.get('/')).text();
  assert.ok(page.indexOf('Intro CS') < page.indexOf('AP CS'), 'Intro CS before AP CS');
});

test('homepage "For admin" block: owner only, lists every class', async () => {
  const ownerPage = await (await clients.owner.get('/')).text();
  assert.match(ownerPage, /For admin/);
  // Class (display name: name - section), teacher, and post count (from
  // seed/fixtures.ts) per row.
  assert.match(ownerPage, /AP CS - Period 4<\/a><\/td>\s*<td>Pat Teacher<\/td>\s*<td>3<\/td>/);
  assert.match(ownerPage, /Intro CS - Period 2<\/a><\/td>\s*<td>Pat Teacher<\/td>\s*<td>1<\/td>/);

  // A garden-variety admin gets the teacher block but not the admin one.
  const adminPage = await (await clients.admin.get('/')).text();
  assert.match(adminPage, /For teachers/);
  assert.doesNotMatch(adminPage, /For admin/);
});

test('/classes routes are admin-gated', async () => {
  assert.equal(await clients.student.status('/classes/g-apcs/resync'), 401);
  assert.equal(await clients.teacher.status('/classes/g-apcs/resync'), 401);
  assert.equal(await clients.teacher.status('/classes/create-all'), 401);
  assert.equal(await clients.teacher.status('/classes/resync-all'), 401);
  // The admin passes the guard; the handler then fails on the (absent)
  // Google API, so all we assert is that it wasn't a permission denial.
  assert.notEqual(await clients.admin.status('/classes/g-apcs/resync'), 401);
  assert.notEqual(await clients.admin.status('/classes/create-all'), 401);
  assert.notEqual(await clients.admin.status('/classes/resync-all'), 401);
});

test('class settings update: teacher only', async () => {
  const post = async (client: Client, body: string) =>
    (
      await fetch(`${base}/c/apcs/settings`, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          cookie: client.cookieHeader(),
        },
        body,
      })
    ).status;

  // Same values as the fixtures so later tests see an unchanged world.
  assert.equal(await post(clients.teacher, 'room=303&period=4'), 302);
  assert.equal(await post(clients.student, 'room=666&period=1'), 401);
  assert.equal(await post(clients.helper, 'room=666&period=1'), 401);
  // Bad period values are rejected before touching the db.
  assert.equal(await post(clients.teacher, 'room=303&period=12'), 400);
  assert.equal(await post(clients.teacher, 'room=303&period=x'), 400);

  const page = await (await clients.teacher.get('/c/apcs/settings')).text();
  assert.match(page, /value="303"/);
  assert.match(page, /value="4"/);
});

test('simulated bell-schedule clock: owner only, shown on the homepage', async () => {
  const post = async (client: Client, body: string) =>
    (
      await fetch(`${base}/debug-time`, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          cookie: client.cookieHeader(),
        },
        body,
      })
    ).status;

  assert.equal(await post(clients.teacher, 'clear=1'), 401);
  assert.equal(await post(clients.admin, 'clear=1'), 401, 'admin but not owner');

  assert.equal(await post(clients.owner, 'time=2030-09-11T09:00'), 302);
  const page = await (await clients.owner.get('/')).text();
  assert.match(page, /pretending it is <strong>2030-09-11 09:00<\/strong>/);

  assert.equal(await post(clients.owner, 'time=not-a-time'), 400);

  // Leave the server on the real clock for whatever runs after us.
  assert.equal(await post(clients.owner, 'clear=1'), 302);
  const cleared = await (await clients.owner.get('/')).text();
  assert.doesNotMatch(cleared, /pretending it is/);
});

test('profile update: student edits own name, denied on others', async () => {
  const res = await fetch(`${base}/users/student1`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: clients.student.cookieHeader(),
    },
    body: 'preferredName=Sammy&pronouns=they%2Fthem',
  });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Sammy/);

  const denied = await fetch(`${base}/users/student2`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: clients.student.cookieHeader(),
    },
    body: 'preferredName=Hacked',
  });
  assert.equal(denied.status, 401);
});

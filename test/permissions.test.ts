import assert from 'node:assert';
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

/*
 * The permissions matrix: spawn the real server in DEV_MODE on a throwaway
 * seeded db, log in as each persona via /dev/login with a cookie-jar fetch
 * helper, and assert the URL x persona status matrix.
 */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'help-test-'));
const ENV = {
  ...process.env,
  DEV_MODE: 'true',
  DB_DIR,
  DB_FILE: 'test.db',
  PORT: '0',
};

let server: ChildProcess;
let base: string;

/*
 * A minimal cookie-jar HTTP client (fetch never follows redirects so we can
 * assert on them, and cookie-session needs both session and session.sig
 * cookies round-tripped).
 */
class Client {
  cookies = new Map<string, string>();

  async get(url: string): Promise<Response> {
    const headers: Record<string, string> = {};
    if (this.cookies.size > 0) {
      headers.cookie = [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    const res = await fetch(`${base}${url}`, { redirect: 'manual', headers });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const eq = (pair as string).indexOf('=');
      this.cookies.set((pair as string).slice(0, eq), (pair as string).slice(eq + 1));
    }
    return res;
  }

  async status(url: string): Promise<number> {
    return (await this.get(url)).status;
  }
}

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
  execFileSync('node', ['seed/seed-dev.ts'], { cwd: ROOT, env: ENV });

  server = spawn('node', ['index.ts'], { cwd: ROOT, env: ENV });

  // PORT=0 makes the OS pick; the server logs the port it got.
  base = await new Promise<string>((resolve, reject) => {
    let out = '';
    server.stdout?.on('data', (data: Buffer) => {
      out += data.toString();
      const m = out.match(/listening on port (\d+)/);
      if (m) {
        resolve(`http://localhost:${m[1]}`);
      }
    });
    server.on('exit', (code) => reject(new Error(`server exited early (${code}): ${out}`)));
    setTimeout(() => reject(new Error(`server never came up: ${out}`)), 15000);
  });

  for (const p of personas) {
    clients[p] = new Client();
    const id = loginIds[p];
    if (id) {
      const res = await clients[p].get(`/dev/login/${id}`);
      assert.equal(res.status, 302, `login as ${id}`);
    }
  }
});

after(() => {
  server?.kill();
  fs.rmSync(DB_DIR, { recursive: true, force: true });
});

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
  [
    '/c/apcs/students',
    { anon: 302, student: 401, helper: 401, teacher: 200, outsider: 401, admin: 401, owner: 401 },
  ],
  [
    '/c/apcs/members',
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
  // The admin passes the guard; the handler then fails on the (absent)
  // Google API, so all we assert is that it wasn't a permission denial.
  assert.notEqual(await clients.admin.status('/classes/g-apcs/resync'), 401);
});

test('profile update: student edits own name, denied on others', async () => {
  const res = await fetch(`${base}/users/student1`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: [...clients.student.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
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
      cookie: [...clients.student.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; '),
    },
    body: 'preferredName=Hacked',
  });
  assert.equal(denied.status, 401);
});

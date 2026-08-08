import assert from 'node:assert';
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/*
 * Shared setup for tests that run against the real server: spawn it in
 * DEV_MODE on a throwaway seeded db, and talk to it with a cookie-jar
 * fetch client (logging in via /dev/login).
 */

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export interface TestServer {
  base: string;
  stop: () => void;
}

export const startServer = async (): Promise<TestServer> => {
  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'help-test-'));
  const env = {
    ...process.env,
    DEV_MODE: 'true',
    DB_DIR: dbDir,
    DB_FILE: 'test.db',
    PORT: '0',
  };

  execFileSync('node', ['seed/seed-dev.ts'], { cwd: ROOT, env });

  const server: ChildProcess = spawn('node', ['index.ts'], { cwd: ROOT, env });

  // PORT=0 makes the OS pick; the server logs the port it got.
  const base = await new Promise<string>((resolve, reject) => {
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

  return {
    base,
    stop: () => {
      server.kill();
      fs.rmSync(dbDir, { recursive: true, force: true });
    },
  };
};

/*
 * A minimal cookie-jar HTTP client (fetch never follows redirects so we can
 * assert on them, and cookie-session needs both session and session.sig
 * cookies round-tripped).
 */
export class Client {
  base: string;
  cookies = new Map<string, string>();

  constructor(base: string) {
    this.base = base;
  }

  cookieHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async get(url: string): Promise<Response> {
    const headers: Record<string, string> = {};
    if (this.cookies.size > 0) {
      headers.cookie = this.cookieHeader();
    }
    const res = await fetch(`${this.base}${url}`, { redirect: 'manual', headers });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const eq = (pair as string).indexOf('=');
      this.cookies.set((pair as string).slice(0, eq), (pair as string).slice(eq + 1));
    }
    return res;
  }

  async status(url: string): Promise<number> {
    const res = await this.get(url);
    // Discard the body so no connection is left open — an SSE body in
    // particular never ends on its own.
    await res.body?.cancel();
    return res.status;
  }

  async login(id: string): Promise<void> {
    const res = await this.get(`/dev/login/${id}`);
    assert.equal(res.status, 302, `login as ${id}`);
  }
}

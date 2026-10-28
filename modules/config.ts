/*
 * All process.env access lives here: read once at boot into typed, defaulted
 * constants. A missing required variable kills the boot with an actionable
 * message rather than surfacing as a mystery failure later.
 */

import process from 'node:process';

const missing: string[] = [];

const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value === '') {
    missing.push(name);
    return '';
  }
  return value;
};

/*
 * DEV_MODE is an explicit opt-in (never derived from NODE_ENV): no real
 * OAuth, a /dev/login page instead, and no secrets required. Never set it
 * in production.
 */
export const DEV_MODE = process.env.DEV_MODE === 'true';

export const PORT = Number(process.env.PORT ?? 3000);

/*
 * Dev-only: pretend it is this wall-clock moment in the school's timezone
 * (e.g. 2026-08-19T09:55) for the bell schedule, so room-page period
 * switching can be exercised on demand. Ignored outside DEV_MODE.
 */
export const DEBUG_TIME = DEV_MODE ? (process.env.DEBUG_TIME ?? '') : '';

/*
 * Longest help request (in characters) the server will accept; the form
 * enforces the same limit client-side. Must be a positive integer.
 */
export const HELP_MAX_CHARS = Number(process.env.HELP_MAX_CHARS ?? 1024);
if (!Number.isInteger(HELP_MAX_CHARS) || HELP_MAX_CHARS <= 0) {
  console.error(`HELP_MAX_CHARS must be a positive integer, got ${process.env.HELP_MAX_CHARS}`);
  process.exit(1);
}

export const DB_DIR = process.env.DB_DIR ?? '.';
export const DB_FILE = process.env.DB_FILE ?? 'help.db';
export const DB_PATH = `${DB_DIR}/${DB_FILE}`;

export const SESSION_SECRET = DEV_MODE
  ? (process.env.SESSION_SECRET ?? 'dev-mode-not-a-secret')
  : required('SESSION_SECRET');

export const GOOGLE_CLIENT_ID = DEV_MODE
  ? (process.env.GOOGLE_CLIENT_ID ?? '')
  : required('GOOGLE_CLIENT_ID');
export const GOOGLE_CLIENT_SECRET = DEV_MODE
  ? (process.env.GOOGLE_CLIENT_SECRET ?? '')
  : required('GOOGLE_CLIENT_SECRET');
export const GOOGLE_REDIRECT_URL = DEV_MODE
  ? (process.env.GOOGLE_REDIRECT_URL ?? '')
  : required('GOOGLE_REDIRECT_URL');

if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('In dev, put them in .env (run via node --env-file-if-exists=.env)');
  console.error('or set DEV_MODE=true; in production they come from fly secrets');
  console.error('(see template.env and set-secrets.sh).');
  process.exit(1);
}

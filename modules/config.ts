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

export const PORT = Number(process.env.PORT ?? 3000);

export const DB_DIR = process.env.DB_DIR ?? '.';
export const DB_FILE = process.env.DB_FILE ?? 'help.db';
export const DB_PATH = `${DB_DIR}/${DB_FILE}`;

export const SESSION_SECRET = required('SESSION_SECRET');

export const GOOGLE_CLIENT_ID = required('GOOGLE_CLIENT_ID');
export const GOOGLE_CLIENT_SECRET = required('GOOGLE_CLIENT_SECRET');
export const GOOGLE_REDIRECT_URL = required('GOOGLE_REDIRECT_URL');

if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('In dev, put them in .env (run via node --env-file-if-exists=.env);');
  console.error('in production they come from fly secrets (see set-secrets.sh).');
  process.exit(1);
}

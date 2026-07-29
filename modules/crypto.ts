import crypto from 'node:crypto';

/*
 * Make a random string (used for OAuth state nonces and generating
 * SESSION_SECRET values via make-secret.ts).
 */
export const randomString = (): string => crypto.randomBytes(24).toString('base64url');

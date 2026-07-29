/*
 * Hand-written ambient types: the session shape and our additions to
 * Express's request and res.locals. This is a global script file (no
 * top-level imports/exports) so these names are available everywhere
 * without importing.
 */

interface SessionUser {
  id: string;
  email: string;
  name: string;
  google_name: string;
  pronouns: string | null;
  is_admin: number | null;
  role?: string;
}

interface Session {
  id?: string;
  loggedIn?: boolean;
  user?: SessionUser;
  auth?: import('../modules/oauth.ts').TokenData;
}

declare namespace Express {
  interface Request {
    session?: Session;
  }

  interface Locals {
    className?: string;
    user?: SessionUser;
    isAdmin?: boolean;
  }
}

/*
 * Hand-written ambient types: the session shape and our additions to
 * Express's res.locals. This is a global script file (no top-level
 * imports/exports) so these names are available everywhere without
 * importing.
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

/*
 * The slice of Google's token response we keep in the session for the
 * Classroom API calls (the full response's id_token would bloat the
 * cookie).
 */
interface StoredTokens {
  access_token: string;
  scope?: string;
  token_type?: string;
}

/*
 * What lives in the cookie-session: a login in progress (nonce/returnTo)
 * or a logged-in user (user/auth).
 */
declare namespace CookieSessionInterfaces {
  interface CookieSessionObject {
    nonce?: string;
    returnTo?: string;
    user?: SessionUser;
    auth?: StoredTokens;
  }
}

declare namespace Express {
  interface Locals {
    className?: string;
    user?: SessionUser;
    isAdmin?: boolean;
    isOwner?: boolean;
    allClasses?: { id: string; name: string; teachers: string | null; posts: number }[];
  }
}

import type { NextFunction, Request, Response } from 'express';
import { DEV_MODE } from './config.ts';
import { randomString } from './crypto.ts';
import db, { ensureUser } from './db.ts';
import oauth from './oauth.ts';

/*
 * Express middleware that redirects all un-logged-in requests to Google
 * sign-in (or /dev/login in DEV_MODE) except for a few special endpoints.
 * The whole session, including the OAuth state nonce, lives in the signed
 * session cookie.
 */
class RequireLogin {
  noAuthRequired: Record<string, boolean>;

  constructor(noAuthRequired: Record<string, boolean>) {
    this.noAuthRequired = noAuthRequired;
  }

  /*
   * To be installed as middleware.
   */
  require() {
    return (req: Request, res: Response, next: NextFunction) => {
      if (this.noAuthRequired[req.path] || (DEV_MODE && req.path.startsWith('/dev/login'))) {
        next();
        return;
      }
      const sessionUser = req.session?.user;
      // If the user has an old cookie and the database has been cleared we
      // treat them as not logged in so they go through the flow that creates
      // the user in the database.
      if (sessionUser && db.userById({ id: sessionUser.id })) {
        next();
      } else {
        this.start(req, res);
      }
    };
  }

  /*
   * Kick off the sign-in dance, remembering where to come back to.
   */
  start(req: Request, res: Response) {
    if (DEV_MODE) {
      req.session = { returnTo: req.originalUrl };
      res.redirect('/dev/login');
      return;
    }
    const nonce = randomString();
    req.session = { nonce, returnTo: req.originalUrl };
    res.redirect(oauth.url(nonce));
  }

  /*
   * To be called from the /auth endpoint. In theory we were redirected here
   * by Google but also in theory an attacker could just hit this endpoint,
   * so the state from the query params must match the nonce we stashed in
   * the session cookie before redirecting to Google.
   */
  async finish(req: Request, res: Response) {
    const nonce = req.session?.nonce;
    if (!nonce || String(req.query.state) !== nonce) {
      console.log('Bad OAuth state');
      res.sendStatus(401);
      return;
    }

    const authData = await oauth.getToken(String(req.query.code));
    const { name, email, sub } = JSON.parse(atob(authData.id_token.split('.')[1] as string));

    const user = ensureUser(sub, email, name);
    if (!user) {
      console.log('Error ensuring user');
      req.session = null;
      res.sendStatus(500);
      return;
    }

    const returnTo = req.session?.returnTo ?? '/';
    // Keep only what the Classroom API calls need: the full token response
    // (with its ~1KB id_token) could push the cookie past the 4KB limit.
    req.session = {
      user,
      auth: {
        access_token: authData.access_token,
        scope: authData.scope,
        token_type: authData.token_type,
      },
    };
    res.redirect(returnTo);
  }

  logout(req: Request) {
    req.session = null;
  }
}

const requireLogin = (noAuthRequired: Record<string, boolean>) => new RequireLogin(noAuthRequired);

export default requireLogin;
export type { RequireLogin };

import type { NextFunction, Request, Response } from 'express';
import { decrypt, encrypt } from './crypto.ts';
import db, { ensureUser } from './db.ts';
import oauth from './oauth.ts';

/*
 * Express middleware that redirects all un-logged-in requests to Google sign-in
 * except for a few special endpoints.
 */
class RequireLogin {
  noAuthRequired: Record<string, boolean>;
  secret: string;

  constructor(noAuthRequired: Record<string, boolean>, secret: string) {
    this.noAuthRequired = noAuthRequired;
    this.secret = secret;
  }

  isLoggedIn(req: Request) {
    if (req.cookies.session) {
      try {
        req.session = decrypt(req.cookies.session, this.secret);
        if (req.session?.loggedIn) {
          return true;
        }
      } catch (_e) {
        console.log(`Failed to decrypt session`);
        return false;
      }
    }
    return false;
  }

  makeNewSession(req: Request, res: Response) {
    const id = oauth.newSessionID();
    const state = `${oauth.newState()}:${req.originalUrl}`;

    db.newSession({ session_id: id, state });
    req.session = { id, loggedIn: false };
    res.cookie('session', encrypt(req.session, this.secret));
    res.redirect(oauth.url(state));
  }

  /*
   * To be installed as middleware.
   */
  require() {
    return (req: Request, res: Response, next: NextFunction) => {
      if (this.noAuthRequired[req.path]) {
        next();
      } else if (this.isLoggedIn(req)) {
        // If the user has an old cookie and the database has been cleared we
        // need to treat them as not logged in so they go through the flow that
        // creates the user in the database.
        if (db.userById({ id: req.session?.user?.id })) {
          next();
        } else {
          res.clearCookie('session');
          this.makeNewSession(req, res);
        }
      } else {
        this.makeNewSession(req, res);
      }
    };
  }

  /*
   * To be called from auth endpoint.
   */
  async finish(req: Request, res: Response) {
    // In theory we were redirected here by Google but also in theory an
    // attacker could just hit this endpoint. So we need to check that the state
    // associated with the session (which an attacker wouldn't know) is the same
    // as what came in the query params. (They'd still need to know the right
    // code so it's not clear what kind of attack this is. But the code at least
    // went over the wire whereas the state did not.)

    const authData = await oauth.getToken(String(req.query.code));

    const session = decrypt(req.cookies.session, this.secret);

    const dbSession = db.getSession({ session_id: session.id });
    if (!dbSession) {
      console.log('Error getting session in /auth');
      res.sendStatus(500);
      return;
    }

    const state = String(req.query.state);
    if (dbSession.state !== state) {
      console.log(`Bad session state ${dbSession.state} vs ${state}`);
      res.sendStatus(401);
      return;
    }

    const { name, email, sub } = JSON.parse(atob(authData.id_token.split('.')[1] as string));

    // We've used the database session entry to confirm the session state. Now
    // we can get rid of it since we store all the relevant data in a cookie.
    db.deleteSession({ session_id: session.id });

    const user = ensureUser(sub, email, name);
    if (!user) {
      console.log('Error ensuring user');
      res.clearCookie('session');
      res.sendStatus(500);
      return;
    }

    const newSession = { ...session, user, loggedIn: true, auth: authData };
    res.cookie('session', encrypt(newSession, this.secret));
    res.redirect(state.split(':')[1] as string);
  }

  logout(res: Response) {
    res.clearCookie('session');
  }
}

const requireLogin = (noAuthRequired: Record<string, boolean>, secret: string) =>
  new RequireLogin(noAuthRequired, secret);

export default requireLogin;
export type { RequireLogin };

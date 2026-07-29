import type { NextFunction, Request, Response } from 'express';
import { decrypt, encrypt } from './crypto.ts';
import oauth from './oauth.ts';
import type DB from './storage.js';

/*
 * Express middleware that redirects all un-logged-in requests to Google sign-in
 * except for a few special endpoints.
 */
class RequireLogin {
  noAuthRequired: Record<string, boolean>;
  db: DB;
  secret: string;

  constructor(noAuthRequired: Record<string, boolean>, db: DB, secret: string) {
    this.noAuthRequired = noAuthRequired;
    this.db = db;
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

    this.db.newSession(id, state, (err: Error | null) => {
      if (err) {
        console.log('Error making new session');
        console.log(err);
        res.sendStatus(500);
      } else {
        req.session = { id, loggedIn: false };
        res.cookie('session', encrypt(req.session, this.secret));
        res.redirect(oauth.url(state));
      }
    });
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
        this.db.userById(req.session?.user?.id, (_err: Error | null, user: SessionUser) => {
          if (user) {
            next();
          } else {
            res.clearCookie('session');
            this.makeNewSession(req, res);
          }
        });
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

    this.db.getSession(
      session.id,
      (err: Error | null, dbSession: { state: string } | undefined) => {
        if (err || !dbSession) {
          console.log('Error getting session in /auth');
          console.log(err);
          console.log(dbSession);
          res.sendStatus(500);
        } else {
          const state = String(req.query.state);

          if (dbSession.state !== state) {
            console.log(`Bad session state ${dbSession.state} vs ${state}`);
            res.sendStatus(401);
          } else {
            const { name, email, sub } = JSON.parse(
              atob(authData.id_token.split('.')[1] as string),
            );

            // We've used the database session entry to confirm the session state.
            // Now we can get rid of it since we store all the relevant data in a
            // cookie.
            this.db.deleteSession(session.id, (err: Error | null) => {
              if (err) {
                console.log('Error deleting session');
                console.log(err);
                res.sendStatus(500);
              } else {
                this.db.ensureUser(sub, email, name, (err: Error | null, user: SessionUser) => {
                  if (err || !user) {
                    console.log('Error ensuring user');
                    console.log(err);
                    res.clearCookie('session');
                    res.sendStatus(500);
                  } else {
                    const newSession = { ...session, user, loggedIn: true, auth: authData };
                    res.cookie('session', encrypt(newSession, this.secret));
                    res.redirect(state.split(':')[1] as string);
                  }
                });
              }
            });
          }
        }
      },
    );
  }

  logout(res: Response) {
    res.clearCookie('session');
  }
}

const requireLogin = (noAuthRequired: Record<string, boolean>, db: DB, secret: string) =>
  new RequireLogin(noAuthRequired, db, secret);

export default requireLogin;

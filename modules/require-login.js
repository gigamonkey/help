import oauth from './oauth.js';
import { encrypt, decrypt } from './crypto.js';

/*
 * Express middleware that redirects all un-logged-in requests to Google sign-in
 * except for a few special endpoints.
 */
class RequireLogin {
  constructor(noAuthRequired, db, secret) {
    this.noAuthRequired = noAuthRequired;
    this.db = db;
    this.secret = secret;
  }

  isLoggedIn(req) {
    if (req.cookies.session) {
      req.session = decrypt(req.cookies.session, this.secret);
      if (req.session.loggedIn) {
        return true;
      }
    }
    return false;
  }

  makeNewSession(req, res) {
    const id = oauth.newSessionID();
    const state = `${oauth.newState()}:${req.originalUrl}`;

    this.db.newSession(id, state, (err) => {
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
    return (req, res, next) => {
      console.log(req.originalUrl);
      if (this.noAuthRequired[req.path] || this.isLoggedIn(req)) {
        next();
      } else {
        this.makeNewSession(req, res);
      }
    };
  }

  /*
   * To be called from auth endpoint.
   */
  async finish(req, res) {
    // In theory we were redirected here by Google but also in theory an
    // attacker could just hit this endpoint. So we need to check that the state
    // associated with the session (which an attacker wouldn't know) is the same
    // as what came in the query params. (They'd still need to know the right
    // code so it's not clear what kind of attack this is. But the code at least
    // went over the wire whereas the state did not.)

    const authData = await oauth.getToken(req.query.code);
    const session = decrypt(req.cookies.session, this.secret);

    this.db.getSession(session.id, (err, dbSession) => {
      if (err) {
        console.log('Error getting session in /auth');
        console.log(err);
        res.sendStatus(500);
      } else {
        const { state } = req.query;

        if (dbSession.state !== state) {
          console.log(`Bad session state ${dbSession.stat} vs ${state}`);
          res.sendStatus(401);
        } else {
          const { name, email } = JSON.parse(atob(authData.id_token.split('.')[1]));

          // We've used the database session entry to confirm the session state.
          // Now we can get rid of it since we store all the relevant data in a
          // cookie.
          this.db.deleteSession(session.id, (err) => {
            if (err) {
              console.log('Error deleting session');
              console.log(err);
              res.sendStatus(500);
            } else {
              this.db.ensureUser(email, name, (err, user) => {
                if (err || !user) {
                  console.log('Error ensuring user');
                  console.log(err);
                  res.sendStatus(500);
                } else {
                  res.cookie('session', encrypt({ ...session, user, loggedIn: true }, this.secret));
                  res.redirect(state.split(':')[1]);
                }
              });
            }
          });
        }
      }
    });
  }
}

const requireLogin = (noAuthRequired, db, secret) => new RequireLogin(noAuthRequired, db, secret);

export default requireLogin;

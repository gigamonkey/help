import cookieSession from 'cookie-session';
import express, { type NextFunction, type Request, type Response } from 'express';
import morgan from 'morgan';
import nunjucks from 'nunjucks';
import classContext from './modules/class-context.ts';
import { DEV_MODE, PORT, SESSION_SECRET } from './modules/config.ts';
import * as datefilter from './modules/datefilter.ts';
import * as mdfilter from './modules/mdfilter.ts';
import { isAuthError } from './modules/oauth.ts';
import requireLogin from './modules/require-login.ts';
import adminRoutes from './modules/routes-admin.ts';
import devRoutes from './modules/routes-dev.ts';
import helperRoutes from './modules/routes-helper.ts';
import publicRoutes from './modules/routes-public.ts';
import teacherRoutes from './modules/routes-teacher.ts';
import userRoutes from './modules/routes-user.ts';

const noAuthRequired = {
  '/auth': true,
  '/favicon.ico': true,
  '/health': true,
  '/logout': true,
};

const app = express();
const login = requireLogin(noAuthRequired);

const env = nunjucks.configure('views', {
  autoescape: true,
  express: app,
});

mdfilter.install(env);
datefilter.install(env);
env.addFilter('slug', (s: string) => s.toLowerCase().replaceAll(/\W+/g, '-'));

app.use(express.json());
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(
  cookieSession({
    name: 'session',
    secret: SESSION_SECRET,
    sameSite: 'lax',
    httpOnly: true,
  }),
);
app.use(login.require());
app.use('/c/:class_id', classContext);
app.use(express.static('public'));

if (DEV_MODE) {
  console.log('*'.repeat(72));
  console.log('*** DEV_MODE is on: real OAuth disabled, /dev/login enabled. ***');
  console.log('*** Never set DEV_MODE in production.                        ***');
  console.log('*'.repeat(72));
  app.use(devRoutes);
}

app.use(publicRoutes(login));
app.use(userRoutes);
app.use(helperRoutes);
app.use(teacherRoutes);
app.use(adminRoutes);

// Our Google access token expires after about an hour and we have no
// refresh token, so any handler that talks to the Classroom API can get a
// 401 back. Quietly re-run the sign-in dance and return to the requested
// page rather than treating it as an error (or, worse, logging out): the
// user is almost certainly still signed in to Google, so the round trip
// through accounts.google.com is invisible.
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (isAuthError(err) && !res.headersSent) {
    login.start(req, res);
  } else {
    next(err);
  }
});

const server = app.listen(PORT, '0.0.0.0', () => {
  const address = server.address();
  if (address && typeof address !== 'string') {
    console.log(`App is listening on port ${address.port}`);
    console.log(`http://${address.address}:${address.port}/`);
  }
});

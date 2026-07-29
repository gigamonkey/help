import cookieParser from 'cookie-parser';
import express from 'express';
import morgan from 'morgan';
import nunjucks from 'nunjucks';
import classContext from './modules/class-context.ts';
import { PORT, SESSION_SECRET } from './modules/config.ts';
import * as mdfilter from './modules/mdfilter.ts';
import requireLogin from './modules/require-login.ts';
import adminRoutes from './modules/routes-admin.ts';
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
const login = requireLogin(noAuthRequired, SESSION_SECRET);

const env = nunjucks.configure('views', {
  autoescape: true,
  express: app,
});

mdfilter.install(env);
env.addFilter('slug', (s: string) => s.toLowerCase().replaceAll(/\W+/g, '-'));

app.use(express.json());
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(login.require());
app.use('/c/:class_id', classContext);
app.use(express.static('public'));

app.use(publicRoutes(login));
app.use(userRoutes(login));
app.use(helperRoutes);
app.use(teacherRoutes);
app.use(adminRoutes);

const server = app.listen(PORT, '0.0.0.0', () => {
  const address = server.address();
  if (address && typeof address !== 'string') {
    console.log(`App is listening on port ${address.port}`);
    console.log(`http://${address.address}:${address.port}/`);
  }
});

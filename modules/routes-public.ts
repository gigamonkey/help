import { Router } from 'express';
import type { RequireLogin } from './require-login.ts';

/*
 * Routes that require no login: health check, logout, and the OAuth
 * callback (which is how you get logged in in the first place).
 */
const routes = (login: RequireLogin): Router => {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.send('Ok.');
  });

  router.get('/logout', (_req, res) => {
    login.logout(res);
    res.send('<html><body><p>Logged out. <a href="/">Start over</a></p></html>');
  });

  router.get('/auth', (req, res) => {
    login.finish(req, res);
  });

  return router;
};

export default routes;

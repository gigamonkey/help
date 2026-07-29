import { Router } from 'express';
import db from './db.ts';

/*
 * DEV_MODE-only login: list the (seeded) users and become one with a
 * click. Only mounted when DEV_MODE is on; never in production.
 */
const router = Router();

const esc = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

router.get('/dev/login', (_req, res) => {
  const users: SessionUser[] = db.allUsers();
  const rows = users
    .map(
      (u) =>
        `<li><a href="/dev/login/${u.id}">${esc(u.name)} &lt;${esc(u.email)}&gt;` +
        `${u.is_admin === 1 ? ' [admin]' : ''}</a></li>`,
    )
    .join('\n');
  res.send(`<html><body><h1>DEV_MODE login</h1><p>Become:</p><ul>${rows}</ul></body></html>`);
});

router.get('/dev/login/:id', (req, res) => {
  const user = db.userById({ id: req.params.id });
  if (!user) {
    res.sendStatus(404);
    return;
  }
  const returnTo = req.session?.returnTo ?? '/';
  req.session = { user };
  res.redirect(returnTo);
});

export default router;

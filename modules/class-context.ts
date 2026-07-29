import type { RequestHandler } from 'express';
import db from './db.ts';

/*
 * Middleware for /c/:class_id: 404s unknown classes and loads the class
 * name and the current user (with their role in this class) into
 * res.locals for the templates.
 */
const classContext: RequestHandler = (req, res, next) => {
  const { class_id } = req.params;
  const className = db.className({ class_id });
  if (className === undefined) {
    res.sendStatus(404);
    return;
  }
  res.locals.className = className;
  const sessionUser = req.session?.user;
  if (sessionUser) {
    const member = db.classMember({ user_id: sessionUser.id, class_id });
    sessionUser.role = member?.role;
    res.locals.user = sessionUser;
  }
  next();
};

export default classContext;

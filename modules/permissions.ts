import { type Request, type RequestHandler, Router, type RouterOptions } from 'express';
import db from './db.ts';

/*
 * Per-class roles (teacher, helper, student) come from the class_members
 * table; is_admin on users is global. Routes are organized into one router
 * per permission regime; guardedRouter injects the regime's guard on every
 * route. Mixed-permission routes keep their checks in-handler.
 */

export const isAdmin = (user?: SessionUser) => user?.is_admin === 1;

/*
 * The site owner. is_admin is granted to every @berkeley.net login, so this
 * is the narrower "actually runs the site" check for owner-only views.
 */
export const OWNER_EMAIL = 'peterseibel@berkeley.net';

export const isOwner = (user?: SessionUser) => user?.email === OWNER_EMAIL;

export const isHelperRole = (member?: SessionUser) =>
  member !== undefined && ['teacher', 'helper'].includes(member.role ?? '');

/*
 * The current user's row, with their role in the class named by the route's
 * :class_id param; undefined if they aren't a member.
 */
export const classMember = (req: Request): SessionUser | undefined =>
  db.classMember({ user_id: req.session?.user?.id, class_id: req.params.class_id });

/*
 * Guard for class-scoped routes: member with one of the given roles.
 */
export const requireRole =
  (...roles: string[]): RequestHandler =>
  (req, res, next) => {
    const member = classMember(req);
    if (member && roles.includes(member.role ?? '')) {
      next();
    } else {
      res.sendStatus(401);
    }
  };

export const teacherOnly = requireRole('teacher');
export const helperOnly = requireRole('teacher', 'helper');

/*
 * Guard for admin-only routes (is_admin is global, not class-scoped).
 */
export const adminOnly: RequestHandler = (req, res, next) => {
  const user = db.userById({ id: req.session?.user?.id });
  if (!user) {
    res.sendStatus(500);
  } else if (isAdmin(user)) {
    next();
  } else {
    res.sendStatus(401);
  }
};

/*
 * A Router that runs the given guard before every route's handlers. The
 * guard is injected per-route (rather than router.use) so req.params for
 * the matched route is populated when it runs.
 */
export const guardedRouter = (guard: RequestHandler, options?: RouterOptions): Router => {
  const router = Router(options);
  for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
    const original = router[method].bind(router) as (
      path: string,
      ...handlers: RequestHandler[]
    ) => Router;
    (router as unknown as Record<string, unknown>)[method] = (
      path: string,
      ...handlers: RequestHandler[]
    ) => original(path, guard, ...handlers);
  }
  return router;
};

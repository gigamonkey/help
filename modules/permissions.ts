import type { Request, Response } from 'express';
import db from './db.ts';

type Predicate = (user: SessionUser) => boolean;
type Handler = (req: Request, res: Response) => void | Promise<void>;

/*
 * Route-handler wrappers that check the current user against a predicate
 * before running the wrapped handler. (Interim shape: the server-structure
 * phase replaces these wrappers with per-regime guarded routers.)
 */
class Permissions {
  isAdmin = (user: SessionUser) => user.is_admin === 1;

  oneOf(...roles: string[]) {
    return (user: SessionUser | undefined) => (user ? roles.includes(user.role ?? '') : false);
  }

  route(predicate: Predicate) {
    return (handler: Handler) => (req: Request, res: Response) => {
      const user = db.userById({ id: req.session?.user?.id });
      if (!user) {
        console.log('No user');
        res.sendStatus(500);
      } else if (predicate(user)) {
        handler(req, res);
      } else {
        res.sendStatus(401);
      }
    };
  }

  classRoute(predicate: Predicate) {
    return (handler: Handler) => (req: Request, res: Response) => {
      const member = db.classMember({
        user_id: req.session?.user?.id,
        class_id: req.params.class_id,
      });
      if (predicate(member)) {
        handler(req, res);
      } else {
        res.sendStatus(401);
      }
    };
  }
}

export default Permissions;

import type { NextFunction, Request, Response } from 'express';
import type DB from './storage.js';

type Predicate = (user: SessionUser) => boolean;
type Handler = (req: Request, res: Response, next?: NextFunction) => void;

class Permissions {
  db: DB;

  constructor(db: DB) {
    this.db = db;
  }

  isAdmin = (user: SessionUser) => user.is_admin === 1;

  oneOf(...roles: string[]) {
    return (user: SessionUser | undefined) => (user ? roles.includes(user.role ?? '') : false);
  }

  route(predicate: Predicate) {
    return (handler: Handler) => (req: Request, res: Response) =>
      this.maybeDoIt(req, res, predicate, () => handler(req, res));
  }

  classRoute(predicate: Predicate) {
    return (handler: Handler) => (req: Request, res: Response) =>
      this.maybeDoItWithClass(req, res, predicate, () => handler(req, res));
  }

  maybeDoIt(req: Request, res: Response, predicate: Predicate, thunk: () => void) {
    this.db.user(req.session?.user?.id, (err: Error | null, user: SessionUser | undefined) => {
      if (err) {
        console.log(err);
        res.sendStatus(500);
      } else if (!user) {
        console.log('No user');
        res.sendStatus(500);
      } else if (predicate(user)) {
        thunk();
      } else {
        res.sendStatus(401);
      }
    });
  }

  maybeDoItWithClass(req: Request, res: Response, predicate: Predicate, thunk: () => void) {
    const id = req.session?.user?.id;
    const { class_id } = req.params;
    this.db.classMember(id, class_id, (err: Error | null, user: SessionUser) => {
      if (err) {
        console.log(err);
        res.sendStatus(500);
      } else if (predicate(user)) {
        thunk();
      } else {
        res.sendStatus(401);
      }
    });
  }
}

export default Permissions;

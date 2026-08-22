import { type Request, Router } from 'express';
import db from './db.ts';
import { broadcastQueueChange } from './live.ts';
import { classMember, helperOnly, isHelperRole } from './permissions.ts';

/*
 * Help-item state changes. These are helper-only except closing, which the
 * requester themselves may also do — that one keeps its check in-handler.
 */
type ClassItemParams = { class_id: string; id: string };

const router = Router();

router.get('/c/:class_id/help/:id/done', (req, res) => {
  const { id } = req.params;
  const help = db.getHelp({ id });
  const member = classMember(req);
  if (isHelperRole(member) || (member !== undefined && member.id === help?.user_id)) {
    db.finishHelp({ id });
    broadcastQueueChange(req.params.class_id);
    res.redirect(req.get('Referrer') ?? '/');
  } else {
    res.sendStatus(401);
  }
});

// The explicit Request type keeps the guard from muddying the params
// inference (string | string[] otherwise).
router.get('/c/:class_id/help/:id/reopen', helperOnly, (req: Request<ClassItemParams>, res) => {
  db.reopenHelp({ id: req.params.id });
  broadcastQueueChange(req.params.class_id);
  res.redirect(req.get('Referrer') ?? '/');
});

export default router;

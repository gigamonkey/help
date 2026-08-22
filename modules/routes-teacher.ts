import db from './db.ts';
import { guardedRouter, teacherOnly } from './permissions.ts';

/*
 * Class-management pages, teachers only.
 */
const router = guardedRouter(teacherOnly);

router.get('/c/:class_id/students', (req, res) => {
  const { class_id } = req.params;
  res.render('students.njk', { ...req.params, students: db.studentStats({ class_id }) });
});

router.get('/c/:class_id/members', (req, res) => {
  const { class_id } = req.params;
  res.render('members.njk', { ...req.params, members: db.memberStats({ class_id }) });
});

/*
 * Room and period settings: where and when the class meets, which is what
 * lets the per-room queue page (/r/:room) pick it up. Prefilled from
 * Google Classroom at create; the teacher's edits are authoritative after
 * that (resync fills in blank settings but never overwrites them).
 */
router.get('/c/:class_id/settings', (req, res) => {
  const { class_id } = req.params;
  res.render('settings.njk', { class_id, ...db.classSettings({ class_id }) });
});

router.post('/c/:class_id/settings', (req, res) => {
  const { class_id } = req.params;
  const room = (typeof req.body.room === 'string' ? req.body.room : '').trim() || null;
  const rawPeriod = (typeof req.body.period === 'string' ? req.body.period : '').trim();
  const period = rawPeriod === '' ? null : Number(rawPeriod);
  // 0-7 plus 8 = Period Ext (EXT_PERIOD in bells.ts).
  if (period !== null && !(Number.isInteger(period) && period >= 0 && period <= 8)) {
    res.sendStatus(400);
    return;
  }
  db.updateClassSettings({ id: class_id, room, period });
  // Back to wherever the form was: the settings page or the homepage's
  // inline per-class forms.
  res.redirect(req.get('Referrer') ?? `/c/${class_id}/settings`);
});

export default router;

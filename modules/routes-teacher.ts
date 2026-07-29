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

export default router;

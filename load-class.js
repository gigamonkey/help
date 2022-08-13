import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';

const classId = process.argv[2];
const json = process.argv[3];
const filename = 'help.db';
const driver = sqlite3.Database;

const addUser = (db, email) => {
  console.log(`Loading ${email}`);
  const sql = 'insert into class_members (email, class_id, role) values (?, ?, ?)';
  return db.run(sql, email, classId, 'student');
};

(async () => {
  const db = await open({ filename, driver });
  const students = await fs.promises.readFile(json, 'utf-8').then((data) => JSON.parse(data));
  await Promise.all(students.map((s) => addUser(db, s.profile.emailAddress)));
  console.log('Done');
})();

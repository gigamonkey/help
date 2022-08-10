import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';

const input = process.argv[2];
const filename = 'help.db';
const driver = sqlite3.Database;

const CREATE_USERS_TABLE = `
  CREATE TABLE IF NOT EXISTS users (
      email TEXT NOT NULL PRIMARY KEY,
      name TEXT NOT NULL,
      google_name TEXT NOT NULL,
      role TEXT
  )
`;

const addUser = (db, email, name, googleName, role) => {
  console.log(`Loading ${name}`);
  const sql =
    'insert into users (email, name, google_name, role) values (?, ?, ?, ?)';
  return db.run(sql, email, name, googleName, role);
};

(async () => {
  const db = await open({ filename, driver });
  await db.run(CREATE_USERS_TABLE);
  await addUser(db, 'peterseibel@berkeley.net', 'Mr. Seibel', 'Peter Seibel', 'teacher');
  const data = await fs.promises.readFile(input, 'utf-8');
  const students = data
    .split('\n')
    .filter((x) => x)
    .map((s) => s.split('\t'));
  await Promise.all(students.map(([name, email]) => addUser(db, email, name, name, 'student')));
  console.log('Done');
})();

-- Used transiently for the OAuth dance and normally deleted when the dance is
-- done. Can delete old ones at some point that stick around when the dance
-- isn't completed.
CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      state TEXT NOT NULL
  );

-- Classes can be but don't have to be linked to a Google classrom but for now
-- the main way to create a class is from a Google classroom so in practice they
-- always will be. The id can be anything but will be used in URLs so should be
-- a human readable slug derived from the name of the course.
CREATE TABLE IF NOT EXISTS classes (
      id TEXT NOT NULL PRIMARY KEY,
      name TEXT NOT NULL,
      google_id TEXT
  );

-- Logged in users. Basically the information we get when they authenticate with
-- Google.
CREATE TABLE IF NOT EXISTS users (
      email TEXT NOT NULL PRIMARY KEY,
      name TEXT NOT NULL,
      google_name TEXT NOT NULL,
      is_admin INTEGER
  );

CREATE TABLE IF NOT EXISTS class_members (
       email TEXT NOT NULL,
       class_id TEXT NOT NULL,
       role TEXT NOT NULL,
       PRIMARY KEY (email, class_id)
  );

CREATE TABLE IF NOT EXISTS help (
      email TEXT NOT NULL,
      class_id TEXT NOT NULL,
      problem TEXT NOT NULL,
      tried TEXT NOT NULL,
      time INTEGER NOT NULL,
      helper TEXT,
      start_time INTEGER,
      end_time INTEGER,
      discard_time integer,
      PRIMARY KEY (email, class_id, time)
  );

CREATE TABLE IF NOT EXISTS journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      class_id TEXT NOT NULL,
      text TEXT NOT NULL,
      time INTEGER NOT NULL,
      prompt_id INTEGER
    );

-- Prompts are created in a class and will show up as current for students who
-- haven't responded to them until they are closed.
CREATE TABLE IF NOT EXISTS prompts (
      prompt_id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      closed_at INTEGER
  );

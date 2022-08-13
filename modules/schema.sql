-- Used transiently for the OAuth dance and normally deleted when the dance is
-- done. Can delete old ones at some point that stick around when the dance
-- isn't completed.
CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      state TEXT NOT NULL
  );

-- Classes can be but don't have to be linked to a Google classrom. If they are
-- we may be able to make sure the roster stays up to date. But all we really
-- need is a unique id to use in the URLs. And it's probably worth giving every
-- class a name.
CREATE TABLE IF NOT EXISTS classes (
      -- can be anything but probably a human readable slug.
      id TEXT NOT NULL PRIMARY KEY,
      join_code TEXT NOT NULL,
      -- These three values come from Google classrom when there is one.
      name TEXT NOT NULL,
      google_id INTEGER
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
      discard_time integer
  );

CREATE TABLE IF NOT EXISTS journal (
      email TEXT NOT NULL,
      class_id TEXT NOT NULL,
      text TEXT NOT NULL,
      time INTEGER NOT NULL,
      prompt_id INTEGER
    );

CREATE TABLE IF NOT EXISTS prompt_texts (
      class_id TEXT NOT NULL,
      title TEXT NOT NULL,
      text TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS prompts (
      class_id TEXT NOT NULL,
      prompt_text_id INTEGER NOT NULL,
      opened_at INTEGER NOT NULL,
      closed_at INTEGER
  );

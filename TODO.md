- Fix the help table's primary key: (user_id, class_id, created_at) at
  seconds resolution means one user filing twice in the same class within a
  second violates the PK (surfaced while writing the seed fixtures).

- Allow discarding help requests (helpers and owner)

- Store the period in the class table and use it to automatically display the
  right class based on the current time.

- Give a view of recently closed tickets with a reopen button.

- Make queue into first-class thing that combines one or more classes.

- Teacher-only user management page: change name, set role, block account.

- Allow editing own help requests.

- Use websockets to update Queue

- When students submits help request pop up a menu with their name in it.

- Add a button to clear the whole queue and/or all tickets over 20 hours old or
  something.

- Get pictures of students and show them in the queue.

- Provide endpoint for exporting data of help requests from a time period and
  classes.

- Maybe add avatars.

- Add a popup window when students ask for help so it's easier to find them in the room.

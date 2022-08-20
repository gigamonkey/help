-- Fix existing references to Ava's old email address.

UPDATE help SET email = 'avatrauner@students.berkeley.net' WHERE email = 'aviyamtrauner@students.berkeley.net';

UPDATE journal SET email = 'avatrauner@students.berkeley.net' WHERE email = 'aviyamtrauner@students.berkeley.net';

DELETE FROM users WHERE email = 'aviyamtrauner@students.berkeley.net';

--------------------------------------------------------------------------------
-- Classes

-- :name className :get(name)
-- The display name of a class: the raw Classroom name plus the section
-- when there is one.
select name || coalesce(' - ' || section, '') as name
from classes where id = :class_id;

-- :name getClass :get
-- A class along with the given user's role in it.
select classes.*, class_id, role
from classes join class_members on classes.id = class_members.class_id
where classes.id = :class_id and user_id = :user_id;

-- :name classMemberships :all
-- All the classes a user belongs to, with their membership row and the
-- class's display name and section (the caller sorts by period).
select class_members.*, section,
  classes.name || coalesce(' - ' || section, '') as name
from class_members join classes on class_members.class_id = classes.id
where user_id = :user_id;

-- :name allClasses :all
-- Every class that has been set up, with its teacher(s) and how many help
-- requests it has seen, for the owner's admin view.
select
  classes.id,
  classes.name || coalesce(' - ' || classes.section, '') as name,
  (select group_concat(users.name, ', ')
     from class_members join users on users.id = class_members.user_id
     where class_members.class_id = classes.id and class_members.role = 'teacher') as teachers,
  (select count(*) from help where help.class_id = classes.id) as posts
from classes
order by classes.name;

-- :name googleClassroomIds :list
-- Google Classroom ids of every class created from Classroom.
select google_id from classes where google_id is not null;

-- :name classByGoogleId :get
select * from classes where google_id = :google_id;

-- :name insertClass :run
insert into classes (id, name, section, google_id)
values (:id, :name, :section, :google_id);

-- :name updateClass :run
-- Refresh the fields that come from Google Classroom on resync.
update classes set name = :name, section = :section where id = :id;

-- :name insertMember :run
insert or ignore into class_members (user_id, class_id, role)
values (:user_id, :class_id, :role);

-- :name removeMember :run
delete from class_members where user_id = :user_id and class_id = :class_id;

-- :name studentIds :list
-- Ids of the current students of a class (for roster resync).
select user_id from class_members where role = 'student' and class_id = :class_id;

--------------------------------------------------------------------------------
-- Help requests

-- :name requestHelp :insert
insert into help (user_id, class_id, problem, created_at)
values (:user_id, :class_id, :problem, unixepoch('now'));

-- :name getHelp :get
select help.rowid as id, help.*, users.name
from help join users on users.id = help.user_id
where help.rowid = :id;

-- :name finishHelp :run
update help set closed_at = unixepoch('now') where rowid = :id;

-- :name reopenHelp :run
update help set closed_at = null where rowid = :id;

-- :name queue :all
-- All open help requests for a class, oldest first.
select help.rowid as id, help.*, users.name
from help join users on users.id = help.user_id
where class_id = :class_id and closed_at is null
order by created_at asc;

-- :name done :all
-- All help requests for a class that have been finished, oldest first.
select rowid as id, * from help
where class_id = :class_id and closed_at is not null
order by created_at asc;

--------------------------------------------------------------------------------
-- Users and members

-- :name userById :get
select * from users where id = :id;

-- :name allUsers :all
-- Everyone, for the DEV_MODE login page.
select * from users order by name;

-- :name insertUser :run
insert or ignore into users (id, email, name, google_name, is_admin)
values (:id, :email, :name, :google_name, :is_admin);

-- :name updateNameAndPronouns :run
update users set name = :name, pronouns = :pronouns where id = :id;

-- :name classMember :get
-- A user along with their role in the given class.
select u.*, m.role
from users as u join class_members as m on u.id = m.user_id
where u.id = :user_id and m.class_id = :class_id;

-- :name studentStats :all
-- Per-student help-request counts for a class.
select
  u.id as id,
  m.*,
  u.name,
  u.pronouns,
  count(distinct help.rowid) as help_requests
from class_members as m
left join help using (user_id, class_id)
left join users as u on u.id = m.user_id
where m.role = 'student' and m.class_id = :class_id
group by m.user_id
order by u.name asc;

-- :name memberStats :all
-- Per-member help-request counts for a class, all roles.
select
  u.id as id,
  m.*,
  u.name,
  count(distinct help.rowid) as help_requests
from class_members as m
left join help using (user_id, class_id)
left join users as u on u.id = m.user_id
where m.class_id = :class_id
group by m.user_id
order by u.name asc;

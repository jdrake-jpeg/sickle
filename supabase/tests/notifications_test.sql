-- Verifies notifications: each kind arrives when it should, a switch turns a
-- kind off, only you can read yours, and push tokens save.
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000bb01'), ('00000000-0000-0000-0000-00000000bb02'), ('00000000-0000-0000-0000-00000000bb03');
insert into public.profiles (id, username, display_name) values
  ('00000000-0000-0000-0000-00000000bb01', 'notifone', 'Notif One'),
  ('00000000-0000-0000-0000-00000000bb02', 'notiftwo', 'Notif Two'),
  ('00000000-0000-0000-0000-00000000bb03', 'notifthree', 'Notif Three');
insert into public.courts (id, name, lat, lng, status) values
  ('00000000-0000-0000-0000-00000000bbcc', 'Notif Court', 43.9, -111.9, 'approved');

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.id(p_k text) returns uuid language sql as $$ select v from ids where k = p_k $$;

set role authenticated;

-- Friend request -> friends notification.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000bb01';
select public.add_friend('00000000-0000-0000-0000-00000000bb02');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000bb02';
do $$ begin
  assert (select count(*) from public.my_notifications() where category = 'friends' and title = 'New friend request') = 1, 'friend request notification';
  assert public.unread_notification_count() = 1, 'one unread';
end $$;
select public.add_friend('00000000-0000-0000-0000-00000000bb01');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000bb01';
do $$ begin assert (select count(*) from public.my_notifications() where title = 'Friend request accepted') = 1, 'accepted notification'; end $$;

-- Others can't read mine.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000bb03';
do $$ begin assert (select count(*) from public.notifications) = 0, 'RLS'; end $$;

-- Teams.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000bb01';
insert into ids select 's1', team_id from public.my_teams_all();
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000bb02';
insert into ids select 's2', team_id from public.my_teams_all();

-- Challenge, answer, messages.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000bb01';
insert into ids select 'c1', public.send_challenge(pg_temp.id('s1'), pg_temp.id('s2'), '00000000-0000-0000-0000-00000000bbcc', now() + interval '1 day', 1::smallint);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000bb02';
do $$ begin
  assert (select title from public.my_notifications() where category = 'challenges') = 'New singles challenge', 'challenge notification';
  assert (select body from public.my_notifications() where category = 'challenges') like 'Notif One challenged you at Notif Court, one game', 'challenge body';
end $$;
select public.respond_to_challenge(pg_temp.id('c1'), true);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000bb01';
do $$ begin assert (select count(*) from public.my_notifications() where title = 'Challenge accepted') = 1, 'accepted'; end $$;
insert into ids select 'm1', public.submit_match_result(pg_temp.id('c1'), '[[11,4]]');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000bb02';
do $$ begin assert (select count(*) from public.my_notifications() where title = 'Confirm the score') = 1, 'confirm score notification'; end $$;

-- Turning challenges off stops those, but not other kinds.
update public.profiles set notify_challenges = false where id = '00000000-0000-0000-0000-00000000bb02';
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000bb01';
insert into ids select 'c2', public.send_challenge(pg_temp.id('s1'), pg_temp.id('s2'), '00000000-0000-0000-0000-00000000bbcc', now() + interval '2 days');
select public.send_message('00000000-0000-0000-0000-00000000bb02', 'Game tonight?');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000bb02';
do $$ begin
  assert (select count(*) from public.my_notifications() where category = 'challenges') = 2, 'no new challenge notification while off';
  assert (select count(*) from public.my_notifications() where category = 'messages') = 1, 'messages still on';
end $$;

-- Teams: a doubles team with Notif Three notifies them.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000bb01';
select public.add_friend('00000000-0000-0000-0000-00000000bb03');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000bb03';
select public.add_friend('00000000-0000-0000-0000-00000000bb01');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000bb01';
select public.create_team('00000000-0000-0000-0000-00000000bb03');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000bb03';
do $$ begin assert (select count(*) from public.my_notifications() where category = 'teams') = 1, 'team notification'; end $$;

-- Court conditions go to people who play there (Notif Two challenged there), once a day.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000bb01';
select public.report_court_condition('00000000-0000-0000-0000-00000000bbcc', 'wet', 'Puddles');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000bb02';
do $$ begin
  assert (select count(*) from public.my_notifications() where category = 'courts') = 1, 'condition notification';
  assert (select title from public.my_notifications() where category = 'courts') = 'Notif Court is wet', 'title';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000bb03';
do $$ begin assert (select count(*) from public.my_notifications() where category = 'courts') = 0, 'not for people who do not play there'; end $$;

-- Read marks and push tokens.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000bb02';
select public.mark_notifications_read();
do $$ begin assert public.unread_notification_count() = 0, 'all read'; end $$;
select public.save_push_token('ExponentPushToken[abc]', 'ios');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000bb03';
select public.save_push_token('ExponentPushToken[abc]', 'ios');
reset role;
do $$ begin assert (select profile_id from public.push_tokens where token = 'ExponentPushToken[abc]') = '00000000-0000-0000-0000-00000000bb03', 'token moves to the signed in player'; end $$;
-- Other tests count court condition reports, so remove ours.
delete from public.court_condition_reports where court_id = '00000000-0000-0000-0000-00000000bbcc';
reset request.jwt.claim.sub;
\echo 'Notifications tests passed'

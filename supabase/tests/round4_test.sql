-- Verifies round 4:
--   * accepting a doubles challenge with one of your own teams
--   * the group chat that appears when a doubles challenge is accepted
--   * Find people filters: rating, nearby, friends in common, friends
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000004a1'), ('00000000-0000-0000-0000-0000000004a2'),
  ('00000000-0000-0000-0000-0000000004a3'), ('00000000-0000-0000-0000-0000000004a4'),
  ('00000000-0000-0000-0000-0000000004a5'), ('00000000-0000-0000-0000-0000000004a6'),
  ('00000000-0000-0000-0000-0000000004a7'), ('00000000-0000-0000-0000-0000000004a8'),
  ('00000000-0000-0000-0000-0000000004a9');
insert into public.profiles (id, username, display_name, skill_level) values
  ('00000000-0000-0000-0000-0000000004a1', 'rfouraa', 'Aaa Four', 3.5),
  ('00000000-0000-0000-0000-0000000004a2', 'rfourbb', 'Bbb Four', 3.5),
  ('00000000-0000-0000-0000-0000000004a3', 'rfourcc', 'Ccc Four', 3.0),
  ('00000000-0000-0000-0000-0000000004a4', 'rfourdd', 'Ddd Four', 3.0),
  ('00000000-0000-0000-0000-0000000004a5', 'rfouree', 'Eee Four', 3.0),
  ('00000000-0000-0000-0000-0000000004a6', 'rfourgg', 'Ggg Four', 3.0),
  ('00000000-0000-0000-0000-0000000004a7', 'rfourhh', 'Hhh Four', 4.5),
  ('00000000-0000-0000-0000-0000000004a8', 'rfourii', 'Iii Four', 3.5),
  ('00000000-0000-0000-0000-0000000004a9', 'rfourjj', 'Jjj Four', 3.5);
insert into public.courts (id, name, lat, lng, status) values
  ('00000000-0000-0000-0000-0000000004cc', 'Round Four Court', 31.0, -101.0, 'approved');

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.id(p_k text) returns uuid language sql as $$ select v from ids where k = p_k $$;

create function pg_temp.expect_error(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm not like p_expected || '%' then
      raise exception 'Expected error "%" but got "%"', p_expected, sqlerrm;
    end if;
    return;
  end;
  raise exception 'Expected error "%" but the statement succeeded: %', p_expected, p_sql;
end $$;

-- Friends: A-B, C-D, C-E, A-C (team for the overlap test), B-G, B-I, C-I.
insert into public.friendships (requester_id, addressee_id, status, accepted_at) values
  ('00000000-0000-0000-0000-0000000004a1', '00000000-0000-0000-0000-0000000004a2', 'accepted', now()),
  ('00000000-0000-0000-0000-0000000004a3', '00000000-0000-0000-0000-0000000004a4', 'accepted', now()),
  ('00000000-0000-0000-0000-0000000004a3', '00000000-0000-0000-0000-0000000004a5', 'accepted', now()),
  ('00000000-0000-0000-0000-0000000004a1', '00000000-0000-0000-0000-0000000004a3', 'accepted', now()),
  ('00000000-0000-0000-0000-0000000004a2', '00000000-0000-0000-0000-0000000004a6', 'accepted', now()),
  ('00000000-0000-0000-0000-0000000004a2', '00000000-0000-0000-0000-0000000004a8', 'accepted', now()),
  ('00000000-0000-0000-0000-0000000004a3', '00000000-0000-0000-0000-0000000004a8', 'accepted', now());

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000004a1';
insert into ids values ('t1', public.create_team('00000000-0000-0000-0000-0000000004a2', 'Aaa and Bbb'));
insert into ids values ('t5', public.create_team('00000000-0000-0000-0000-0000000004a3', 'Aaa and Ccc'));
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000004a3';
insert into ids values ('t2', public.create_team('00000000-0000-0000-0000-0000000004a4', 'Ccc and Ddd'));
insert into ids values ('t3', public.create_team('00000000-0000-0000-0000-0000000004a5', 'Ccc and Eee'));
insert into ids select 'solo_c', team_id from public.my_teams_all() where is_singles;

-- A challenges Ccc and Ddd with Aaa and Bbb.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000004a1';
insert into ids select 'c1', public.send_challenge(pg_temp.id('t1'), pg_temp.id('t2'), '00000000-0000-0000-0000-0000000004cc', now() + interval '1 day');

-- Nobody has a chat before it is accepted.
do $$ begin
  assert (select count(*) from public.my_group_chats()) = 0, 'no chat before accepting';
end $$;

-- Ddd is not on Ccc and Eee, so Ddd can't pick that team. Ccc can't pick a
-- team with someone from the other side, or a singles team.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000004a4';
select pg_temp.expect_error($$select public.respond_to_challenge(pg_temp.id('c1'), true, pg_temp.id('t3'))$$, 'Pick one of your own teams');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000004a3';
select pg_temp.expect_error($$select public.respond_to_challenge(pg_temp.id('c1'), true, pg_temp.id('t5'))$$, 'A player cannot be on both teams');
select pg_temp.expect_error($$select public.respond_to_challenge(pg_temp.id('c1'), true, pg_temp.id('solo_c'))$$, 'Only doubles challenges can switch teams');

-- Ccc accepts and plays with Eee instead.
select public.respond_to_challenge(pg_temp.id('c1'), true, pg_temp.id('t3'));
reset role;
do $$ begin
  assert (select challenged_team_id from public.challenges where id = pg_temp.id('c1')) = pg_temp.id('t3'), 'team switched';
  assert (select status from public.challenges where id = pg_temp.id('c1')) = 'accepted', 'accepted';
  assert (select count(*) from public.group_chats where challenge_id = pg_temp.id('c1')) = 1, 'one group chat';
  assert (select count(*) from public.group_chat_members m join public.group_chats g on g.id = m.chat_id where g.challenge_id = pg_temp.id('c1')) = 4, 'four players';
  assert not exists (select 1 from public.group_chat_members m join public.group_chats g on g.id = m.chat_id where g.challenge_id = pg_temp.id('c1') and m.profile_id = '00000000-0000-0000-0000-0000000004a4'), 'Ddd is not on the team that plays';
end $$;
insert into ids select 'chat', id from public.group_chats where challenge_id = pg_temp.id('c1');

-- The four players see it; others don't.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000004a1';
do $$ begin
  assert (select count(*) from public.my_group_chats()) = 1, 'Aaa has the chat';
  assert (select members from public.my_group_chats()) = 'Bbb, Ccc, Eee', 'other names';
  assert (select title from public.my_group_chats()) = 'Aaa and Bbb vs Ccc and Eee', 'title';
  assert (select unread from public.my_group_chats()) = 0, 'nothing unread yet';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000004a4';
do $$ begin
  assert (select count(*) from public.my_group_chats()) = 0, 'Ddd has no chat';
  assert (select count(*) from public.group_conversation(pg_temp.id('chat'))) = 0, 'Ddd reads nothing';
end $$;
select pg_temp.expect_error($$select public.send_group_message(pg_temp.id('chat'), 'Hi')$$, 'You are not in this chat');

-- Messages, unread counts and reading.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000004a1';
select pg_temp.expect_error($$select public.send_group_message(pg_temp.id('chat'), '   ')$$, 'Write a message first');
select pg_temp.expect_error($$select public.send_group_message(pg_temp.id('chat'), repeat('x', 201))$$, 'Keep messages under 200');
select public.send_group_message(pg_temp.id('chat'), '  Free now?  ');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000004a5';
select public.send_group_message(pg_temp.id('chat'), 'Good game');
do $$ begin
  assert (select count(*) from public.group_conversation(pg_temp.id('chat'))) = 2, 'two messages';
  assert (select body from public.group_conversation(pg_temp.id('chat')) order by created_at, id limit 1) = 'Free now?', 'trimmed';
  assert (select unread from public.my_group_chats()) = 0, 'sending counts as reading';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000004a3';
do $$ begin
  assert (select unread from public.my_group_chats()) = 2, 'Ccc has two unread';
  assert public.unread_group_count() = 2, 'unread total';
end $$;
select public.mark_group_read(pg_temp.id('chat'));
do $$ begin
  assert public.unread_group_count() = 0, 'read';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000004a2';
do $$ begin
  assert public.unread_group_count() = 2, 'Bbb has two unread';
  assert (select last_body from public.my_group_chats()) = 'Good game', 'last message';
  assert (select last_sender from public.my_group_chats()) = 'Eee', 'last sender';
end $$;

-- Message alerts went to the others, not the sender.
reset role;
do $$ begin
  assert exists (select 1 from public.notifications where profile_id = '00000000-0000-0000-0000-0000000004a2' and category = 'messages' and data ->> 'path' = '/chats'), 'alert sent';
  assert not exists (select 1 from public.notifications where profile_id = '00000000-0000-0000-0000-0000000004a5' and category = 'messages' and body = 'Good game'), 'not to the sender';
end $$;

-- Singles challenges don't get a group chat.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000004a1';
insert into ids select 'solo_a', team_id from public.my_teams_all() where is_singles;
insert into ids select 'solo_b', team_id from public.player_teams_all('00000000-0000-0000-0000-0000000004a2') where is_singles;
insert into ids select 's1', public.send_challenge(pg_temp.id('solo_a'), pg_temp.id('solo_b'), '00000000-0000-0000-0000-0000000004cc', now() + interval '2 days', 1::smallint);
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000004a2';
select public.respond_to_challenge(pg_temp.id('s1'), true);
reset role;
do $$ begin
  assert (select count(*) from public.group_chats where challenge_id = pg_temp.id('s1')) = 0, 'singles made no chat';
end $$;

-- Deleting an account takes the person out of the chat.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000004a5';
select public.delete_my_account();
reset role;
do $$ begin
  assert (select count(*) from public.group_chat_members where chat_id = pg_temp.id('chat')) = 3, 'Eee left the chat';
  assert (select count(*) from public.group_messages where chat_id = pg_temp.id('chat')) = 1, 'Eee messages are gone';
end $$;

-- Deleting a chat is just for you. The last one out closes it.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000004a1';
select public.leave_group_chat(pg_temp.id('chat'));
do $$ begin
  assert (select count(*) from public.my_group_chats()) = 0, 'Aaa deleted it';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000004a2';
do $$ begin
  assert (select count(*) from public.my_group_chats()) = 1, 'Bbb still has it';
end $$;
select public.leave_group_chat(pg_temp.id('chat'));
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000004a3';
select public.leave_group_chat(pg_temp.id('chat'));
reset role;
do $$ begin
  assert (select count(*) from public.group_chats where id = pg_temp.id('chat')) = 0, 'chat closed when empty';
  assert (select count(*) from public.group_messages where chat_id = pg_temp.id('chat')) = 0, 'messages gone too';
end $$;

-- ---------------------------------------------------------------------------
-- Find people. Viewer is Aaa, friends with Bbb and Ccc.
-- Ggg is a friend of Bbb and likes the court. Hhh is far above Aaa and
-- knows nobody. Iii is a friend of Bbb and Ccc and is looking nearby.
-- ---------------------------------------------------------------------------
insert into public.preferred_courts (profile_id, court_id) values
  ('00000000-0000-0000-0000-0000000004a6', '00000000-0000-0000-0000-0000000004cc');
update public.profiles set availability = 'looking_to_play', availability_expires_at = now() + interval '1 hour'
where id = '00000000-0000-0000-0000-0000000004a8';
insert into public.player_locations (profile_id, approx_lat, approx_lng) values ('00000000-0000-0000-0000-0000000004a8', 31.01, -101.0);

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000004a1';
do $$ begin
  -- New people by default: no friends, not me.
  assert exists (select 1 from public.find_players() where username::text = 'rfourgg'), 'sees Ggg';
  assert exists (select 1 from public.find_players() where username::text = 'rfourhh'), 'sees Hhh';
  assert not exists (select 1 from public.find_players() where username::text in ('rfouraa', 'rfourbb', 'rfourcc')), 'no friends or me';
  -- Friends only.
  assert exists (select 1 from public.find_players(p_scope => 'friends') where username::text = 'rfourbb' and is_friend), 'Bbb in friends';
  assert not exists (select 1 from public.find_players(p_scope => 'friends') where username::text = 'rfourgg'), 'no strangers in friends';
  assert exists (select 1 from public.find_players(p_scope => 'all') where username::text in ('rfourbb')), 'all has friends';
  assert exists (select 1 from public.find_players(p_scope => 'all') where username::text in ('rfourhh')), 'all has others';
  -- Rating.
  assert (select count(*) from public.find_players(4.0, 4.99) where username::text like 'rfour%') = 1, 'one player at 4.0 to 4.99';
  assert (select username::text from public.find_players(4.0, 4.99) where username::text like 'rfour%') = 'rfourhh', 'Hhh is the 4.5';
  assert not exists (select 1 from public.find_players(3.0, 3.99) where username::text = 'rfourhh'), 'rating excludes Hhh';
  -- Friends in common: Iii has two, Ggg has one, Hhh none.
  assert (select count(*) from public.find_players(p_common_only => true) where username::text like 'rfour%') = 3, 'three have friends in common';
  assert not exists (select 1 from public.find_players(p_common_only => true) where username::text = 'rfourhh'), 'Hhh has none';
  assert (select mutual_friends from public.find_players() where username::text = 'rfourii') = 2, 'Iii has two in common';
  assert (select mutual_friends from public.find_players() where username::text = 'rfourgg') = 1, 'Ggg has one in common';
  -- Nearby: Ggg likes the court, Iii is looking next to it. Hhh has no known place.
  assert exists (select 1 from public.find_players(null, null, 31.0, -101.0, 5) where username::text = 'rfourgg'), 'Ggg is nearby';
  assert exists (select 1 from public.find_players(null, null, 31.0, -101.0, 5) where username::text = 'rfourii'), 'Iii is nearby';
  assert not exists (select 1 from public.find_players(null, null, 31.0, -101.0, 5) where username::text = 'rfourhh'), 'Hhh is not nearby';
  assert (select distance_miles from public.find_players(null, null, 31.0, -101.0, 5) where username::text = 'rfourgg') = 0.5, 'distance rounds up to half a mile';
  assert not exists (select 1 from public.find_players(null, null, 40.0, -101.0, 5) where username::text = 'rfourgg'), 'far from here';
  -- Without a place, the radius is ignored.
  assert exists (select 1 from public.find_players(null, null, null, null, 5) where username::text = 'rfourhh'), 'no place, no radius';
end $$;

-- Blocked people disappear.
reset role;
insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-0000000004a1', '00000000-0000-0000-0000-0000000004a7');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000004a1';
do $$ begin
  assert not exists (select 1 from public.find_players() where username::text = 'rfourhh'), 'blocked Hhh is hidden';
end $$;

reset role;
reset request.jwt.claim.sub;
\echo 'Round 4 tests passed'

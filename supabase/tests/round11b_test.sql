-- Verifies round 11b: challenges where every player says OK, open spots, edits,
-- friends and opponents on profiles, admin courts going to review, and the
-- Closed court condition.
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000012a1'), ('00000000-0000-0000-0000-0000000012a2'),
  ('00000000-0000-0000-0000-0000000012a3'), ('00000000-0000-0000-0000-0000000012a4'),
  ('00000000-0000-0000-0000-0000000012a5'), ('00000000-0000-0000-0000-0000000012a6'),
  ('00000000-0000-0000-0000-0000000012a7');
insert into public.profiles (id, username, display_name) values
  ('00000000-0000-0000-0000-0000000012a1', 'tbaaa', 'Aaa Twelve'),
  ('00000000-0000-0000-0000-0000000012a2', 'tbbbb', 'Bbb Twelve'),
  ('00000000-0000-0000-0000-0000000012a3', 'tbccc', 'Ccc Twelve'),
  ('00000000-0000-0000-0000-0000000012a4', 'tbddd', 'Ddd Twelve'),
  ('00000000-0000-0000-0000-0000000012a5', 'tbeee', 'Eee Twelve'),
  ('00000000-0000-0000-0000-0000000012a6', 'tbfff', 'Fff Twelve'),
  ('00000000-0000-0000-0000-0000000012a7', 'tbggg', 'Ggg Twelve');
update public.profiles set challenges_from = 'friends' where id = '00000000-0000-0000-0000-0000000012a6';
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-0000000012a1';
insert into public.courts (id, name, lat, lng, status) values
  ('00000000-0000-0000-0000-0000000012cc', 'Twelve Court', 43.82, -111.79, 'approved'),
  ('00000000-0000-0000-0000-0000000012cd', 'Twelve Court Two', 43.83, -111.79, 'approved');
-- Aaa and Bbb are friends. Ccc and Eee are friends with each other.
insert into public.friendships (requester_id, addressee_id, status, accepted_at) values
  ('00000000-0000-0000-0000-0000000012a1', '00000000-0000-0000-0000-0000000012a2', 'accepted', now()),
  ('00000000-0000-0000-0000-0000000012a3', '00000000-0000-0000-0000-0000000012a5', 'accepted', now()),
  ('00000000-0000-0000-0000-0000000012a2', '00000000-0000-0000-0000-0000000012a3', 'accepted', now());
insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-0000000012a7', '00000000-0000-0000-0000-0000000012a1');

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

create function pg_temp.pending_count(p uuid) returns bigint language sql security definer as $$ select count(*) from public.challenge_players where challenge_id = p and response = 'pending' $$;
grant execute on function pg_temp.pending_count(uuid) to authenticated;
set role authenticated;

-- ---------------------------------------------------------------------------
-- A doubles game: Aaa + Bbb against Ccc + Ddd. Ccc and Ddd are not Aaa's friends.
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000012a1';
insert into ids values ('c1', public.create_game_challenge('doubles',
  '00000000-0000-0000-0000-0000000012a2', '00000000-0000-0000-0000-0000000012a3', '00000000-0000-0000-0000-0000000012a4',
  '00000000-0000-0000-0000-0000000012cc', now() + interval '2 days', 3::smallint));

do $$
declare r record;
begin
  select * into r from public.my_challenges() where challenge_id = pg_temp.id('c1');
  assert r.status = 'pending', 'waiting on everyone';
  assert r.i_created and r.can_edit and r.my_response = 'in', 'creator is in and can edit';
  assert jsonb_array_length(r.players) = 4, 'four players';
  assert (select count(*) from jsonb_array_elements(r.players) p where p ->> 'response' = 'pending') = 3, 'three are waiting';
  assert (select count(*) from jsonb_array_elements(r.players) p where (p ->> 'mine')::boolean) = 2, 'two on my side';
end $$;

-- Everyone who was picked gets their own alert; the sender does not.
reset role;
do $$ begin
  assert exists (select 1 from public.notifications where profile_id = '00000000-0000-0000-0000-0000000012a2' and title = 'Doubles partner invite'), 'partner invited';
  assert exists (select 1 from public.notifications where profile_id = '00000000-0000-0000-0000-0000000012a3' and title = 'New doubles challenge'), 'opponent 1 told';
  assert exists (select 1 from public.notifications where profile_id = '00000000-0000-0000-0000-0000000012a4' and title = 'New doubles challenge'), 'opponent 2 told';
  assert not exists (select 1 from public.notifications where profile_id = '00000000-0000-0000-0000-0000000012a1' and title in ('Doubles partner invite', 'New doubles challenge')), 'not to the sender';
  assert (select count(*) from public.notifications where profile_id = '00000000-0000-0000-0000-0000000012a3' and title = 'New doubles challenge') = 1, 'told once';
end $$;
set role authenticated;

-- The sender can't answer their own challenge, and outsiders can't either.
select pg_temp.expect_error($$select public.respond_to_challenge(pg_temp.id('c1'), true)$$, 'You sent this challenge');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000012a5';
select pg_temp.expect_error($$select public.respond_to_challenge(pg_temp.id('c1'), true)$$, 'You are not in this challenge');
select pg_temp.expect_error(format($$select public.edit_challenge(%L, 'singles', null, %L, null, %L, now() + interval '1 day', 1::smallint)$$,
  pg_temp.id('c1'), '00000000-0000-0000-0000-0000000012a3', '00000000-0000-0000-0000-0000000012cc'), 'Only the player who sent it');

-- Each player says OK for themselves. It is only on when all three have.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000012a3';
do $$ begin assert public.respond_to_challenge(pg_temp.id('c1'), true) = 'pending', 'one OK is not enough'; end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000012a2';
do $$ begin assert public.respond_to_challenge(pg_temp.id('c1'), true) = 'pending', 'two OKs are not enough'; end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000012a4';
do $$ begin assert public.respond_to_challenge(pg_temp.id('c1'), false) = 'declined', 'someone can''t make it'; end $$;
-- The sender sees who said what.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000012a1';
do $$
declare r record;
begin
  select * into r from public.my_challenges() where challenge_id = pg_temp.id('c1');
  assert r.status = 'declined', 'declined';
  assert (select p ->> 'response' from jsonb_array_elements(r.players) p where p ->> 'id' = '00000000-0000-0000-0000-0000000012a4') = 'out', 'Ddd is out';
  assert (select p ->> 'response' from jsonb_array_elements(r.players) p where p ->> 'id' = '00000000-0000-0000-0000-0000000012a3') = 'in', 'Ccc is in';
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.notifications where profile_id = '00000000-0000-0000-0000-0000000012a1' and title = 'Challenge declined'), 'sender told';
end $$;
set role authenticated;

-- Swap Ddd for Eee. Ccc and Bbb keep their OK; only Eee is asked.
select public.edit_challenge(pg_temp.id('c1'), 'doubles',
  '00000000-0000-0000-0000-0000000012a2', '00000000-0000-0000-0000-0000000012a3', '00000000-0000-0000-0000-0000000012a5',
  '00000000-0000-0000-0000-0000000012cc', (select proposed_time from public.my_challenges() where challenge_id = pg_temp.id('c1')), 3::smallint);
do $$
declare r record;
begin
  select * into r from public.my_challenges() where challenge_id = pg_temp.id('c1');
  assert r.status = 'pending', 'asking Eee now';
  assert jsonb_array_length(r.players) = 4, 'still four';
  assert (select p ->> 'response' from jsonb_array_elements(r.players) p where p ->> 'id' = '00000000-0000-0000-0000-0000000012a5') = 'pending', 'Eee is asked';
  assert (select p ->> 'response' from jsonb_array_elements(r.players) p where p ->> 'id' = '00000000-0000-0000-0000-0000000012a3') = 'in', 'Ccc keeps their OK';
  assert not exists (select 1 from jsonb_array_elements(r.players) p where p ->> 'id' = '00000000-0000-0000-0000-0000000012a4'), 'Ddd is off it';
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.notifications where profile_id = '00000000-0000-0000-0000-0000000012a5' and title = 'New doubles challenge'), 'Eee invited';
  assert (select count(*) from public.notifications where profile_id = '00000000-0000-0000-0000-0000000012a3' and title = 'The game changed') = 0, 'Ccc not bothered';
end $$;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000012a5';
do $$ begin assert public.respond_to_challenge(pg_temp.id('c1'), true) = 'accepted', 'everyone is in'; end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.notifications where profile_id = '00000000-0000-0000-0000-0000000012a3' and title = 'Game is on'), 'players told it is on';
  assert exists (select 1 from public.group_chats where challenge_id = (select v from ids where k = 'c1')), 'a game chat was made';
end $$;
set role authenticated;

-- A new time sends everyone back to waiting.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000012a1';
select public.edit_challenge(pg_temp.id('c1'), 'doubles',
  '00000000-0000-0000-0000-0000000012a2', '00000000-0000-0000-0000-0000000012a3', '00000000-0000-0000-0000-0000000012a5',
  '00000000-0000-0000-0000-0000000012cc', now() + interval '3 days', 3::smallint);
do $$
declare r record;
begin
  select * into r from public.my_challenges() where challenge_id = pg_temp.id('c1');
  assert r.status = 'pending', 'back to waiting';
  assert (select count(*) from jsonb_array_elements(r.players) p where p ->> 'response' = 'pending') = 3, 'all three asked again';
  assert r.my_response = 'in', 'the sender stays in';
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.notifications where profile_id = '00000000-0000-0000-0000-0000000012a3' and title = 'The game changed'), 'told it changed';
end $$;
set role authenticated;
-- A new court does too, and so does the length.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000012a3';
select public.respond_to_challenge(pg_temp.id('c1'), true);
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000012a1';
select public.edit_challenge(pg_temp.id('c1'), 'doubles',
  '00000000-0000-0000-0000-0000000012a2', '00000000-0000-0000-0000-0000000012a3', '00000000-0000-0000-0000-0000000012a5',
  '00000000-0000-0000-0000-0000000012cd', (select proposed_time from public.my_challenges() where challenge_id = pg_temp.id('c1')), 3::smallint);
do $$ begin assert pg_temp.pending_count(pg_temp.id('c1')) = 3, 'a new court asks everyone again'; end $$;

-- Only the sender can change it, and not to something that isn't allowed.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000012a2';
select pg_temp.expect_error(format($$select public.edit_challenge(%L, 'doubles', %L, %L, %L, %L, now() + interval '3 days', 3::smallint)$$,
  pg_temp.id('c1'), '00000000-0000-0000-0000-0000000012a2', '00000000-0000-0000-0000-0000000012a3', '00000000-0000-0000-0000-0000000012a5', '00000000-0000-0000-0000-0000000012cd'),
  'Only the player who sent it');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000012a1';
select pg_temp.expect_error(format($$select public.edit_challenge(%L, 'doubles', %L, %L, %L, %L, now() - interval '1 day', 3::smallint)$$,
  pg_temp.id('c1'), '00000000-0000-0000-0000-0000000012a2', '00000000-0000-0000-0000-0000000012a3', '00000000-0000-0000-0000-0000000012a5', '00000000-0000-0000-0000-0000000012cd'),
  'Pick a time in the future');

-- ---------------------------------------------------------------------------
-- Open spots
-- ---------------------------------------------------------------------------
-- Singles with nobody picked yet: saved, and nobody else sees it.
insert into ids values ('open', public.create_game_challenge('singles', null, null, null, '00000000-0000-0000-0000-0000000012cc', now() + interval '1 day', 1::smallint));
do $$
declare r record;
begin
  select * into r from public.my_challenges() where challenge_id = pg_temp.id('open');
  assert r.open_opponent and r.status = 'pending' and r.their_team_name = 'Open spot', 'open spot';
  assert jsonb_array_length(r.players) = 1, 'just the sender';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000012a3';
do $$ begin assert not exists (select 1 from public.my_challenges() where challenge_id = pg_temp.id('open')), 'others do not see it'; end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000012a1';
-- Fill it in later by editing.
select public.edit_challenge(pg_temp.id('open'), 'singles', null, '00000000-0000-0000-0000-0000000012a3', null,
  '00000000-0000-0000-0000-0000000012cc', (select proposed_time from public.my_challenges() where challenge_id = pg_temp.id('open')), 1::smallint);
do $$
declare r record;
begin
  select * into r from public.my_challenges() where challenge_id = pg_temp.id('open');
  assert not r.open_opponent and r.status = 'pending' and jsonb_array_length(r.players) = 2, 'opponent added, waiting';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000012a3';
do $$ begin assert public.respond_to_challenge(pg_temp.id('open'), true) = 'accepted', 'singles is on'; end $$;

-- A doubles game with no partner yet, and an opponent who has no partner yet.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000012a1';
insert into ids values ('half', public.create_game_challenge('doubles', null, '00000000-0000-0000-0000-0000000012a3', null,
  '00000000-0000-0000-0000-0000000012cc', now() + interval '1 day', 3::smallint));
do $$
declare r record;
begin
  select * into r from public.my_challenges() where challenge_id = pg_temp.id('half');
  assert r.challenger_needs_partner and r.needs_partner, 'both partners still to find';
  assert r.my_team_name like '% + partner TBD' and r.their_team_name like '% + partner TBD', 'shows TBD';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000012a3';
-- Saying OK is not enough: the game needs their partner too.
do $$ begin assert public.respond_to_challenge(pg_temp.id('half'), true) = 'pending', 'needs their partner'; end $$;
insert into ids values ('halfteam', public.accept_challenge_with_partner(pg_temp.id('half'), '00000000-0000-0000-0000-0000000012a5'));
do $$ begin assert (select status from public.my_challenges() where challenge_id = pg_temp.id('half')) = 'pending', 'their partner still has to say OK'; end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000012a5';
do $$ begin assert public.respond_to_challenge(pg_temp.id('half'), true) = 'accepted', 'on once their partner says OK'; end $$;
-- The sender picks their own partner after the game, as before, with no extra OK.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000012a1';
insert into ids values ('myteam', public.set_challenge_partner(pg_temp.id('half'), '00000000-0000-0000-0000-0000000012a2'));
do $$
declare r record;
begin
  select * into r from public.my_challenges() where challenge_id = pg_temp.id('half');
  assert r.status = 'accepted' and not r.challenger_needs_partner, 'still on';
  assert (select p ->> 'response' from jsonb_array_elements(r.players) p where p ->> 'id' = '00000000-0000-0000-0000-0000000012a2') = 'in', 'partner counted in';
end $$;

-- ---------------------------------------------------------------------------
-- Who you can pick
-- ---------------------------------------------------------------------------
-- Anyone, even if you are not friends.
insert into ids values ('anyone', public.create_game_challenge('singles', null, '00000000-0000-0000-0000-0000000012a4', null, '00000000-0000-0000-0000-0000000012cc', now() + interval '1 day', 3::smallint));
-- But the rules still hold.
select pg_temp.expect_error(format($$select public.create_game_challenge('singles', null, %L, null, %L, now() + interval '1 day', 3::smallint)$$,
  '00000000-0000-0000-0000-0000000012a6', '00000000-0000-0000-0000-0000000012cc'), 'Fff only takes challenges from friends');
select pg_temp.expect_error(format($$select public.create_game_challenge('singles', null, %L, null, %L, now() + interval '1 day', 3::smallint)$$,
  '00000000-0000-0000-0000-0000000012a7', '00000000-0000-0000-0000-0000000012cc'), 'That player is not available');
select pg_temp.expect_error(format($$select public.create_game_challenge('singles', null, %L, null, %L, now() + interval '1 day', 3::smallint)$$,
  '00000000-0000-0000-0000-0000000012a1', '00000000-0000-0000-0000-0000000012cc'), 'You are already in the game');
select pg_temp.expect_error(format($$select public.create_game_challenge('doubles', %L, %L, %L, %L, now() + interval '1 day', 3::smallint)$$,
  '00000000-0000-0000-0000-0000000012a3', '00000000-0000-0000-0000-0000000012a3', '00000000-0000-0000-0000-0000000012a4', '00000000-0000-0000-0000-0000000012cc'), 'Each spot needs a different player');
select pg_temp.expect_error(format($$select public.create_game_challenge('singles', %L, %L, null, %L, now() + interval '1 day', 3::smallint)$$,
  '00000000-0000-0000-0000-0000000012a2', '00000000-0000-0000-0000-0000000012a3', '00000000-0000-0000-0000-0000000012cc'), 'Singles is one player against one player');
select pg_temp.expect_error(format($$select public.create_game_challenge('singles', null, %L, null, %L, now() - interval '1 hour', 3::smallint)$$,
  '00000000-0000-0000-0000-0000000012a3', '00000000-0000-0000-0000-0000000012cc'), 'Pick a time in the future');
select pg_temp.expect_error(format($$select public.create_game_challenge('triples', null, %L, null, %L, now() + interval '1 day', 3::smallint)$$,
  '00000000-0000-0000-0000-0000000012a3', '00000000-0000-0000-0000-0000000012cc'), 'Pick singles or doubles');
-- A friend only player can be challenged by a friend.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000012a3';
-- Someone you added by name can be your partner, but not your opponent.
insert into ids select 'ppl', public.create_person('Walk On');
select pg_temp.expect_error(format($$select public.create_game_challenge('singles', null, %L, null, %L, now() + interval '1 day', 3::smallint)$$,
  pg_temp.id('ppl'), '00000000-0000-0000-0000-0000000012cc'), 'Opponents have to be players on Sickle');
insert into ids values ('withppl', public.create_game_challenge('doubles', pg_temp.id('ppl'), '00000000-0000-0000-0000-0000000012a4', '00000000-0000-0000-0000-0000000012a2',
  '00000000-0000-0000-0000-0000000012cc', now() + interval '1 day', 3::smallint));
do $$ begin
  assert (select p ->> 'response' from public.my_challenges() c, jsonb_array_elements(c.players) p where c.challenge_id = pg_temp.id('withppl') and p ->> 'id' = pg_temp.id('ppl')::text) = 'in', 'added people are in';
end $$;

-- ---------------------------------------------------------------------------
-- Played games can't be changed
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000012a1';
insert into ids select 'm1', public.submit_match_result(pg_temp.id('open'), '[[11,5]]');
select pg_temp.expect_error(format($$select public.edit_challenge(%L, 'singles', null, %L, null, %L, now() + interval '5 days', 1::smallint)$$,
  pg_temp.id('open'), '00000000-0000-0000-0000-0000000012a3', '00000000-0000-0000-0000-0000000012cc'), 'This challenge is closed');
-- The old challenges that were already set up are covered too: everyone has a row.
reset role;
do $$ begin
  assert not exists (
    select 1 from public.challenges c
    where c.status in ('pending', 'accepted', 'declined') and not c.logged and not exists (select 1 from public.matches m where m.challenge_id = c.id)
      and not exists (select 1 from public.challenge_players cp where cp.challenge_id = c.id)
  ), 'every open challenge has player rows';
end $$;
set role authenticated;

-- ---------------------------------------------------------------------------
-- Friends and opponents on a profile
-- ---------------------------------------------------------------------------
-- Ccc has friends Eee and Bbb. Aaa is friends with Bbb: one in common.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000012a1';
do $$
declare r record;
begin
  select * into r from public.friend_counts('00000000-0000-0000-0000-0000000012a3');
  assert r.friends = 2 and r.mutual = 1, 'Ccc has two friends and one is shared';
  assert (select count(*) from public.player_friends('00000000-0000-0000-0000-0000000012a3')) = 2, 'list matches';
  assert (select mutual from public.player_friends('00000000-0000-0000-0000-0000000012a3') where profile_id = '00000000-0000-0000-0000-0000000012a2') = true, 'Bbb is shared';
  assert (select mutual from public.player_friends('00000000-0000-0000-0000-0000000012a3') where profile_id = '00000000-0000-0000-0000-0000000012a5') = false, 'Eee is not';
  assert (select mutual from public.friend_counts('00000000-0000-0000-0000-0000000012a1')) = 0, 'no mutual with yourself';
end $$;
-- A player who blocked you shows nothing.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000012a7';
do $$ begin assert (select count(*) from public.player_friends('00000000-0000-0000-0000-0000000012a1')) = 0, 'blocked sees no friends'; end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000012a1';

-- Opponents come from confirmed games. Ccc confirms Aaa's win.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000012a3';
do $$ begin
  assert (select count(*) from public.player_opponents('00000000-0000-0000-0000-0000000012a1')) = 0, 'nothing until it is confirmed';
end $$;
select public.confirm_match_result(pg_temp.id('m1'));
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000012a5';
do $$
declare r record;
begin
  select * into r from public.player_opponents('00000000-0000-0000-0000-0000000012a1') where profile_id = '00000000-0000-0000-0000-0000000012a3';
  assert r.wins = 1 and r.losses = 0, 'Aaa is 1-0 against Ccc';
  select * into r from public.player_opponents('00000000-0000-0000-0000-0000000012a3') where profile_id = '00000000-0000-0000-0000-0000000012a1';
  assert r.wins = 0 and r.losses = 1, 'Ccc is 0-1 against Aaa';
end $$;
-- A private record hides the list.
reset role;
update public.profiles set show_record = false where id = '00000000-0000-0000-0000-0000000012a1';
set role authenticated;
do $$ begin assert (select count(*) from public.player_opponents('00000000-0000-0000-0000-0000000012a1')) = 0, 'private record hides opponents'; end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000012a1';
do $$ begin assert (select count(*) from public.player_opponents('00000000-0000-0000-0000-0000000012a1')) = 1, 'you still see your own'; end $$;

-- ---------------------------------------------------------------------------
-- Courts and conditions
-- ---------------------------------------------------------------------------
-- An admin's court goes to review like anyone's, and they approve it themselves.
insert into ids select 'newcourt', public.submit_court('Review Me Court', 44.1, -112.1, null, null, false, 'Two courts behind the church. Park on the north side.', null);
do $$ begin
  assert (select status from public.courts where id = pg_temp.id('newcourt')) = 'pending', 'admin court waits';
  assert (select submission_note from public.courts where id = pg_temp.id('newcourt')) like 'Two courts behind%', 'description kept';
end $$;
select public.review_court(pg_temp.id('newcourt'), true);
do $$ begin assert (select status from public.courts where id = pg_temp.id('newcourt')) = 'approved', 'approved after review'; end $$;
-- Closed is a condition now.
select public.report_court_condition('00000000-0000-0000-0000-0000000012cc', 'closed', 'Locked for the tournament');
do $$ begin assert (select condition::text from public.court_conditions('00000000-0000-0000-0000-0000000012cc') limit 1) = 'closed', 'closed reported'; end $$;

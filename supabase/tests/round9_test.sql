-- Verifies round 9:
--   * names can be edited
--   * people you create: hidden from search, only yours, rename, remove, link to a friend's account
--   * log a game with no challenge: counts at once against a made up person, needs
--     confirmation from a real opponent
--   * a doubles challenge to a player with no team: they name a partner to accept
--   * edit and delete: other side confirms, or it just happens against made up people
--   * match_detail
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000009a1'), ('00000000-0000-0000-0000-0000000009a2'),
  ('00000000-0000-0000-0000-0000000009a3'), ('00000000-0000-0000-0000-0000000009a4'),
  ('00000000-0000-0000-0000-0000000009a5');
insert into public.profiles (id, username, display_name) values
  ('00000000-0000-0000-0000-0000000009a1', 'rnineaa', 'Aaa Nine'),
  ('00000000-0000-0000-0000-0000000009a2', 'rninebb', 'Bbb Nine'),
  ('00000000-0000-0000-0000-0000000009a3', 'rninecc', 'Ccc Nine'),
  ('00000000-0000-0000-0000-0000000009a4', 'rninedd', 'Ddd Nine'),
  ('00000000-0000-0000-0000-0000000009a5', 'rnineee', 'Eee Nine');
insert into public.courts (id, name, lat, lng, status) values
  ('00000000-0000-0000-0000-0000000009cc', 'Nine Court', 43.82, -111.79, 'approved');
insert into public.friendships (requester_id, addressee_id, status, accepted_at) values
  ('00000000-0000-0000-0000-0000000009a1', '00000000-0000-0000-0000-0000000009a2', 'accepted', now()),
  ('00000000-0000-0000-0000-0000000009a1', '00000000-0000-0000-0000-0000000009a3', 'accepted', now()),
  ('00000000-0000-0000-0000-0000000009a1', '00000000-0000-0000-0000-0000000009a5', 'accepted', now()),
  ('00000000-0000-0000-0000-0000000009a3', '00000000-0000-0000-0000-0000000009a4', 'accepted', now());

-- Someone else's made up person: nobody but their owner can put them in a game.
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000009f1');
insert into public.profiles (id, username, display_name, is_placeholder, owner_id) values
  ('00000000-0000-0000-0000-0000000009f1', 'rninegh', 'Ghost Nine', true, '00000000-0000-0000-0000-0000000009a5');

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

-- ---------------------------------------------------------------------------
-- Names and made up people
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000009a1';

update public.profiles set display_name = 'Aaa Renamed' where id = auth.uid();
do $$ begin assert (select display_name from public.profiles where id = auth.uid()) = 'Aaa Renamed', 'name edited'; end $$;
update public.profiles set display_name = 'Aaa Nine' where id = auth.uid();

insert into ids values ('wes', public.create_person('Walk On Wes'));
insert into ids values ('pam', public.create_person('Pam Plus'));
do $$ begin
  assert (select count(*) from public.my_people()) = 2, 'two people made';
  assert (select count(*) from public.search_players('Walk On')) = 0, 'made up people are not searchable';
  assert not exists (select 1 from public.browse_players() where display_name = 'Walk On Wes'), 'not browsable';
end $$;
select pg_temp.expect_error($$select public.create_person('   ')$$, 'Give them a name');

set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000009a2';
do $$ begin assert (select count(*) from public.my_people()) = 0, 'not B''s people'; end $$;
select pg_temp.expect_error(format($$select public.rename_person(%L, 'Hacked')$$, pg_temp.id('wes')), 'That is not one of your people');
select pg_temp.expect_error(format($$select public.delete_person(%L)$$, pg_temp.id('wes')), 'That is not one of your people');

-- ---------------------------------------------------------------------------
-- Log a game vs a made up person: counts at once
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000009a1';
select pg_temp.expect_error(format($$select public.log_game(%L, now() - interval '1 hour', 3::smallint, '[[11,5],[11,7]]'::jsonb, null, %L)$$,
  '00000000-0000-0000-0000-0000000009cc', '00000000-0000-0000-0000-0000000009f1'), 'Everyone has to be a real player');
select pg_temp.expect_error(format($$select public.log_game(%L, now() + interval '3 hours', 3::smallint, '[[11,5],[11,7]]'::jsonb, null, %L)$$,
  '00000000-0000-0000-0000-0000000009cc', pg_temp.id('wes')), 'A game cannot be in the future');
select pg_temp.expect_error(format($$select public.log_game(%L, now() - interval '1 hour', 3::smallint, '[[11,5],[11,7]]'::jsonb, %L, %L)$$,
  '00000000-0000-0000-0000-0000000009cc', '00000000-0000-0000-0000-0000000009a2', pg_temp.id('wes')), 'Doubles needs');
insert into ids values ('g1', public.log_game('00000000-0000-0000-0000-0000000009cc', now() - interval '1 hour', 3::smallint, '[[11,5],[11,7]]'::jsonb, null, pg_temp.id('wes')));
do $$
declare r record;
begin
  select * into r from public.my_challenges() where challenge_id = pg_temp.id('g1');
  assert r.match_status = 'confirmed' and r.logged and r.i_won, 'counts at once';
  assert r.games = '[[11,5],[11,7]]'::jsonb, 'scores in my order';
  assert (select wins from public.my_teams_all() where is_singles) = 1, 'record updated';
  assert (select wins from public.my_people() where profile_id = pg_temp.id('wes')) = 0 and (select losses from public.my_people() where profile_id = pg_temp.id('wes')) = 1, 'Wes lost one';
end $$;
select pg_temp.expect_error(format($$select public.delete_person(%L)$$, pg_temp.id('wes')), 'They have games logged');

-- Doubles vs a real friend and a made up partner: counts at once too (round 10).
insert into ids values ('g2', public.log_game('00000000-0000-0000-0000-0000000009cc', now() - interval '2 hours', 1::smallint, '[[11,9]]'::jsonb,
  '00000000-0000-0000-0000-0000000009a2', '00000000-0000-0000-0000-0000000009a3', pg_temp.id('pam')));
do $$
declare r record;
begin
  select * into r from public.my_challenges() where challenge_id = pg_temp.id('g2');
  assert r.match_status = 'confirmed' and r.logged and not r.awaiting_me, 'counts at once';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000009a3';
do $$
declare r record;
begin
  select * into r from public.my_challenges() where challenge_id = pg_temp.id('g2');
  assert not r.awaiting_me and r.match_status = 'confirmed', 'C has nothing to confirm';
end $$;

-- ---------------------------------------------------------------------------
-- Edit and delete
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000009a1';
insert into ids select 'm1', match_id from public.my_challenges() where challenge_id = pg_temp.id('g1');
insert into ids select 'm2', match_id from public.my_challenges() where challenge_id = pg_temp.id('g2');

do $$ begin
  assert public.propose_match_change(pg_temp.id('m1'), 'edit', '[[11,5],[9,11],[11,9]]'::jsonb) = 'applied', 'applied at once';
  assert (select games from public.my_challenges() where challenge_id = pg_temp.id('g1')) = '[[11,5],[9,11],[11,9]]'::jsonb, 'new scores';
end $$;
select pg_temp.expect_error(format($$select public.propose_match_change(%L, 'edit', '[[11,5],[9,11],[11,9]]'::jsonb)$$, pg_temp.id('m1')), 'Nothing changed');
select pg_temp.expect_error(format($$select public.propose_match_change(%L, 'edit', '[[3,2]]'::jsonb)$$, pg_temp.id('m1')), '');

-- Against a real friend: also applied at once, since it is a logged game (round 10).
do $$ begin
  assert public.propose_match_change(pg_temp.id('m2'), 'edit', '[[9,11]]'::jsonb) = 'applied', 'applied';
  assert (select games from public.my_challenges() where challenge_id = pg_temp.id('g2')) = '[[9,11]]'::jsonb, 'changed';
end $$;
-- The other side can fix it back, or delete it, and nobody has to approve.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000009a3';
do $$ begin
  assert (select count(*) from public.my_pending_changes()) = 0, 'nothing pending';
  assert public.propose_match_change(pg_temp.id('m2'), 'delete') = 'applied', 'delete applied';
  assert not exists (select 1 from public.my_challenges() where challenge_id = pg_temp.id('g2')), 'gone from my games';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000009a1';
do $$ begin
  assert not exists (select 1 from public.my_challenges() where challenge_id = pg_temp.id('g2')), 'gone for A too';
  assert public.match_detail(pg_temp.id('g2')) is null, 'detail is gone';
  assert not exists (select 1 from public.player_history('00000000-0000-0000-0000-0000000009a1') where challenge_id = pg_temp.id('g2')), 'gone from history';
end $$;

-- ---------------------------------------------------------------------------
-- match_detail
-- ---------------------------------------------------------------------------
do $$
declare d jsonb;
begin
  d := public.match_detail(pg_temp.id('g1'));
  assert d ->> 'court_name' = 'Nine Court' and d ->> 'my_side' = 'a' and d ->> 'winner' = 'a', 'detail basics';
  assert jsonb_array_length(d -> 'team_b' -> 'players') = 1 and (d -> 'team_b' -> 'players' -> 0 ->> 'placeholder')::boolean, 'shows who played';
  assert d ->> 'logged' = 'true', 'flagged as logged';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000009a5';
do $$ begin assert public.match_detail(pg_temp.id('g1')) is not null, 'anyone can see a public record'; end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000009a1';

-- ---------------------------------------------------------------------------
-- Doubles challenge to a player with no team
-- ---------------------------------------------------------------------------
insert into ids select 'ab', team_id from public.my_teams_all() where partner_id = '00000000-0000-0000-0000-0000000009a2';
insert into ids values ('c1', public.send_challenge_to_player(pg_temp.id('ab'), '00000000-0000-0000-0000-0000000009a4', '00000000-0000-0000-0000-0000000009cc', now() + interval '1 day', 3::smallint));
do $$
declare r record;
begin
  select * into r from public.my_challenges() where challenge_id = pg_temp.id('c1');
  assert r.needs_partner and r.status = 'pending' and r.their_team_name = 'Ddd Nine + partner TBD', 'shows partner TBD';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000009a4';
do $$
declare r record;
begin
  select * into r from public.my_challenges() where challenge_id = pg_temp.id('c1');
  assert r.needs_partner and not r.i_challenged, 'D sees it';
end $$;
select pg_temp.expect_error(format($$select public.respond_to_challenge(%L, true)$$, pg_temp.id('c1')), 'Pick your partner');
select pg_temp.expect_error(format($$select public.accept_challenge_with_partner(%L, %L)$$, pg_temp.id('c1'), '00000000-0000-0000-0000-0000000009f1'), 'Your partner has to be');
select pg_temp.expect_error(format($$select public.accept_challenge_with_partner(%L, %L)$$, pg_temp.id('c1'), '00000000-0000-0000-0000-0000000009a4'), 'Pick a partner');
insert into ids values ('dc', public.accept_challenge_with_partner(pg_temp.id('c1'), '00000000-0000-0000-0000-0000000009a3'));
do $$
declare r record;
begin
  select * into r from public.my_challenges() where challenge_id = pg_temp.id('c1');
  assert r.status = 'accepted' and not r.needs_partner and r.my_team_id = pg_temp.id('dc'), 'accepted with a new team';
  assert (select player_high is not null from public.teams where id = pg_temp.id('dc')), 'it is a doubles team';
end $$;
reset role;
do $$ begin assert exists (select 1 from public.group_chats where challenge_id = (select v from ids where k = 'c1')), 'a game chat was made'; end $$;
set role authenticated;
-- A decline still works the old way.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000009a1';
insert into ids values ('c2', public.send_challenge_to_player(pg_temp.id('ab'), '00000000-0000-0000-0000-0000000009a5', '00000000-0000-0000-0000-0000000009cc', now() + interval '1 day', 1::smallint));
select pg_temp.expect_error(format($$select public.send_challenge_to_player(%L, %L, %L, now() + interval '1 day')$$, pg_temp.id('ab'), '00000000-0000-0000-0000-0000000009a2', '00000000-0000-0000-0000-0000000009cc'), 'A player cannot be on both teams');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000009a5';
do $$ begin assert public.respond_to_challenge(pg_temp.id('c2'), false) = 'declined', 'declined'; end $$;

-- ---------------------------------------------------------------------------
-- Link a made up person to a friend's account
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000009a1';
-- (Round 10: anyone real can be linked, no friendship needed. Pam's old game is deleted, so it just moves.)
do $$ begin assert public.link_person_to_account(pg_temp.id('pam'), '00000000-0000-0000-0000-0000000009a4') >= 0, 'linked to a non friend'; end $$;
select pg_temp.expect_error(format($$select public.link_person_to_account(%L, %L)$$, pg_temp.id('wes'), '00000000-0000-0000-0000-0000000009a1'), 'That is you');
-- Wes is a new friend of A's: E. Wes played A, so E can't be A, but E is fine.
do $$ begin
  assert public.link_person_to_account(pg_temp.id('wes'), '00000000-0000-0000-0000-0000000009a5') = 1, 'one game moved';
  assert not exists (select 1 from public.my_people() where profile_id = pg_temp.id('wes')), 'Wes is no longer a loose person';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000009a5';
do $$ begin
  assert (select count(*) from public.player_history('00000000-0000-0000-0000-0000000009a5') where not won) = 1, 'E now has the game Wes played (a loss, after the edit)';
end $$;
reset role;
do $$ begin
  assert (select deleted_at is not null and linked_to = '00000000-0000-0000-0000-0000000009a5' from public.profiles where id = (select v from ids where k = 'wes')), 'Wes is retired and points to E';
end $$;
reset request.jwt.claim.sub;

\echo 'Round 9 tests passed'

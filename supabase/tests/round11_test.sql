-- Verifies round 11: the admin test account is a separate player that stays out of
-- search, records, leaderboards and everyone else's view of games.
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000011a'), ('00000000-0000-0000-0000-00000000011b'),
  ('00000000-0000-0000-0000-00000000011c');
insert into public.profiles (id, username, display_name) values
  ('00000000-0000-0000-0000-00000000011a', 'relevena', 'Aaa Eleven'),
  ('00000000-0000-0000-0000-00000000011b', 'relevenb', 'Bbb Eleven'),
  ('00000000-0000-0000-0000-00000000011c', 'relevenc', 'Ccc Eleven');
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-00000000011a';
insert into public.courts (id, name, lat, lng, status) values
  ('00000000-0000-0000-0000-0000000011cc', 'Eleven Court', 43.82, -111.79, 'approved');

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

set role authenticated;

-- Only an admin can make one.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000011b';
select pg_temp.expect_error($$select public.admin_create_test_account()$$, 'Only admins can make a test account');
select pg_temp.expect_error($$select * from public.admin_test_account()$$, 'Only admins have a test account');

-- The admin makes it, once.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000011a';
insert into ids values ('t', public.admin_create_test_account());
do $$ begin
  assert public.admin_create_test_account() = pg_temp.id('t'), 'second call returns the same one';
  assert (select count(*) from public.admin_test_account()) = 1, 'login is available to its admin';
  assert (select email from public.admin_test_account()) like 'sickle.test.%@example.com', 'email';
  assert (select count(*) from public.profiles where is_test) = 1, 'one test profile';
  assert (select not is_admin and test_owner = '00000000-0000-0000-0000-00000000011a' from public.profiles where id = pg_temp.id('t')), 'not an admin, owned by the admin';
  assert exists (select 1 from public.my_friends() where profile_id = pg_temp.id('t') and relation = 'friend'), 'friends with its admin';
  assert exists (select 1 from public.search_players('sickletest') where profile_id = pg_temp.id('t')), 'the admin can find it';
end $$;
reset role;
select pg_temp.expect_error($$update public.profiles set is_admin = true where is_test$$, 'The test account can''t be an admin');
set role authenticated;

-- Other people never see it.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000011b';
do $$ begin
  assert not exists (select 1 from public.search_players('sickletest')), 'not in search';
  assert not exists (select 1 from public.search_players('Test Player')), 'not by name either';
  assert not exists (select 1 from public.browse_players() where profile_id = pg_temp.id('t')), 'not in browse';
  assert not exists (select 1 from public.find_players(null, null, null, null, null, false, 'all') where profile_id = pg_temp.id('t')), 'not in find players';
  assert not exists (select 1 from public.profiles where id = pg_temp.id('t')), 'not even by a direct read';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000011a';
do $$ begin assert exists (select 1 from public.profiles where id = pg_temp.id('t')), 'the admin reads it'; end $$;

-- A game between the admin and the test player.
insert into ids values ('g', public.log_game('00000000-0000-0000-0000-0000000011cc', now() - interval '1 hour', 1::smallint, '[[11,4]]'::jsonb, null, pg_temp.id('t'), null));
do $$
declare r record;
begin
  select * into r from public.my_challenges() where challenge_id = pg_temp.id('g');
  assert r.is_test and r.match_status = 'confirmed', 'the admin sees the test game, marked as a test';
  assert (select wins from public.player_records where profile_id = '00000000-0000-0000-0000-00000000011a') = 0, 'not in the admin record';
  assert (select wins from public.my_teams_all() where is_singles) = 0, 'not in the singles record';
  assert not exists (select 1 from public.court_leaderboard('00000000-0000-0000-0000-0000000011cc', true)), 'not on the leaderboard';
  assert not exists (select 1 from public.player_history('00000000-0000-0000-0000-00000000011a') where challenge_id = pg_temp.id('g')), 'not in the admin history';
end $$;
-- Someone else cannot see the game.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000011c';
do $$ begin
  assert public.match_detail(pg_temp.id('g')) is null, 'detail is hidden';
  assert not exists (select 1 from public.player_history('00000000-0000-0000-0000-00000000011a') where challenge_id = pg_temp.id('g')), 'not in history';
end $$;

-- The test player sees the shared game and can change it.
reset role;
do $$ begin
  assert (select count(*) from public.matches where is_test) = 1, 'the match is marked';
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', (select v::text from ids where k = 't'), false);
do $$
declare r record;
begin
  select * into r from public.my_challenges() where challenge_id = pg_temp.id('g');
  assert r.is_test and not r.i_won, 'the test player sees it and lost';
  assert public.propose_match_change(r.match_id, 'edit', '[[11,9]]'::jsonb) = 'applied', 'and can fix it';
  assert not public.is_admin(), 'the test player is not an admin';
  assert public.is_test_user(), 'it knows it is a test player';
end $$;
-- The test player can find its admin like any other player.
do $$ begin assert exists (select 1 from public.search_players('relevena')), 'the test player finds real players'; end $$;

reset role;
reset request.jwt.claim.sub;
\echo 'Round 11 tests passed'

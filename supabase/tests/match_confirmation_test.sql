-- Verifies challenges, score agreement and the court leaderboard:
--   * only accepted challenges can get a score, entered by a player in them
--   * only the other team can confirm; only confirmed matches count
--   * a dispute carries a corrected score back to the first team
--   * after two corrections, another dispute goes to an admin
--   * impossible scores are rejected
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c'), ('00000000-0000-0000-0000-00000000000d'),
  ('00000000-0000-0000-0000-00000000000e');
insert into public.profiles (id, username, display_name, skill_level) values
  ('00000000-0000-0000-0000-00000000000a', 'drake', 'Drake', 3.8),
  ('00000000-0000-0000-0000-00000000000b', 'jack', 'Jack', 3.8),
  ('00000000-0000-0000-0000-00000000000c', 'tysor', 'Ty', 3.7),
  ('00000000-0000-0000-0000-00000000000d', 'ryan', 'Ryan', 3.7),
  ('00000000-0000-0000-0000-00000000000e', 'rando', 'Rando', 3.0);
insert into public.courts (id, name, lat, lng) values
  ('00000000-0000-0000-0000-0000000000c1', 'Test Court', 43.82, -111.79);

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
create function pg_temp.id(p_k text) returns uuid language sql as $$ select v from ids where k = p_k $$;

-- Asserts that a statement fails with a message starting with p_expected.
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

-- Teams: Drake + Jack, Ty + Ryan.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into ids values ('dj', public.create_team('00000000-0000-0000-0000-00000000000b'));
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
insert into ids values ('tr', public.create_team('00000000-0000-0000-0000-00000000000d'));

-- Ty challenges Drake + Jack.
insert into ids select 'c1', public.send_challenge(pg_temp.id('tr'), pg_temp.id('dj'), '00000000-0000-0000-0000-0000000000c1', now() + interval '1 day');

-- No score before the challenge is accepted, and the challenger can't accept it.
select pg_temp.expect_error($$select public.submit_match_result(pg_temp.id('c1'), '[[11,7],[11,8]]')$$, 'Scores can only be entered');
select pg_temp.expect_error($$select public.respond_to_challenge(pg_temp.id('c1'), true)$$, 'Only the challenged team');

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select public.respond_to_challenge(pg_temp.id('c1'), true);

-- An outsider cannot enter the score.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
select pg_temp.expect_error($$select public.submit_match_result(pg_temp.id('c1'), '[[11,7],[11,8]]')$$, 'Only a player in this match');

-- Invalid scores are rejected.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect_error($$select public.submit_match_result(pg_temp.id('c1'), '[[11,10],[11,5]]')$$, 'Game 1 has an invalid score');
select pg_temp.expect_error($$select public.submit_match_result(pg_temp.id('c1'), '[[9,7],[11,5]]')$$, 'Game 1 has an invalid score');
select pg_temp.expect_error($$select public.submit_match_result(pg_temp.id('c1'), '[[14,10],[11,5]]')$$, 'Game 1 has an invalid score');
select pg_temp.expect_error($$select public.submit_match_result(pg_temp.id('c1'), '[[11,5],[11,5],[11,5]]')$$, 'The match was already decided');
select pg_temp.expect_error($$select public.submit_match_result(pg_temp.id('c1'), '[[11,5]]')$$, 'A best-of-3 match has 2 or 3 games');
select pg_temp.expect_error($$select public.submit_match_result(pg_temp.id('c1'), '[[11,5],[5,11]]')$$, 'Nobody has won two games yet');

-- Ty enters a 2-1 win for Ty + Ryan (challenger score first).
insert into ids select 'm1', public.submit_match_result(pg_temp.id('c1'), '[[11,7],[9,11],[11,8]]', now() - interval '1 hour');
select pg_temp.expect_error($$select public.submit_match_result(pg_temp.id('c1'), '[[11,7],[11,8]]')$$, 'A score was already entered');

do $$ begin
  assert (select wins from public.team_records where team_id = pg_temp.id('tr')) = 0, 'unconfirmed match must not count';
end $$;

-- Neither Ty nor Ryan can confirm their own score.
select pg_temp.expect_error($$select public.confirm_match_result(pg_temp.id('m1'))$$, 'Only a player on the other team');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.expect_error($$select public.confirm_match_result(pg_temp.id('m1'))$$, 'Only a player on the other team');

-- Direct writes do nothing; results only change through the functions.
do $$ begin
  begin
    update public.matches set status = 'confirmed', awaiting_team_id = null where id = pg_temp.id('m1');
  exception when insufficient_privilege then null;
  end;
  assert (select status from public.matches where id = pg_temp.id('m1')) = 'awaiting_confirmation', 'direct update changed status';
end $$;

-- Jack disputes game 3 with a corrected score. Now Ty + Ryan must answer.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect_error($$select public.dispute_match_result(pg_temp.id('m1'), '[[11,7],[9,11],[11,8]]')$$, 'That is the same score');
do $$ begin
  assert public.dispute_match_result(pg_temp.id('m1'), '[[11,7],[9,11],[8,11]]', 'We won game 3') = 'awaiting_confirmation';
  assert (select awaiting_team_id from public.matches where id = pg_temp.id('m1')) = pg_temp.id('tr');
  assert (select winner_team_id from public.matches where id = pg_temp.id('m1')) = pg_temp.id('dj');
end $$;
select pg_temp.expect_error($$select public.confirm_match_result(pg_temp.id('m1'))$$, 'Only a player on the other team');

-- Ty disputes back (correction 2), Jack disputes again: goes to an admin.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select public.dispute_match_result(pg_temp.id('m1'), '[[11,7],[9,11],[12,10]]');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  assert public.dispute_match_result(pg_temp.id('m1'), '[[11,7],[9,11],[8,11]]') = 'needs_admin';
  assert (select count(*) from public.score_proposals where match_id = pg_temp.id('m1')) = 3;
  assert (select wins + losses from public.team_records where team_id = pg_temp.id('dj')) = 0, 'disputed match must not count';
end $$;
select pg_temp.expect_error($$select public.confirm_match_result(pg_temp.id('m1'))$$, 'This result is already needs_admin');

-- A second challenge, confirmed straight away, counts and moves the leaderboard.
insert into ids select 'c2', public.send_challenge(pg_temp.id('dj'), pg_temp.id('tr'), '00000000-0000-0000-0000-0000000000c1', now() + interval '2 hours');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select public.respond_to_challenge(pg_temp.id('c2'), true);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into ids select 'm2', public.submit_match_result(pg_temp.id('c2'), '[[11,4],[11,6]]');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  assert public.confirm_match_result(pg_temp.id('m2')) = 'confirmed';
  assert (select wins from public.team_records where team_id = pg_temp.id('dj')) = 1;
  assert (select losses from public.player_records where profile_id = '00000000-0000-0000-0000-00000000000c') = 1;
  assert (select status from public.challenges where id = pg_temp.id('c2')) = 'completed';
  assert (select team_id from public.court_leaderboard('00000000-0000-0000-0000-0000000000c1') where rank = 1) = pg_temp.id('dj');
  assert (select rating from public.court_leaderboard('00000000-0000-0000-0000-0000000000c1') where rank = 1) = 1016;
  assert (select team_name from public.court_leaderboard('00000000-0000-0000-0000-0000000000c1') where rank = 1) = 'Drake + Jack';
end $$;

-- Once confirmed, the result is locked.
select pg_temp.expect_error($$select public.dispute_match_result(pg_temp.id('m2'), '[[4,11],[6,11]]')$$, 'This result is already confirmed');

-- Admin edits to a confirmed match are logged.
reset role;
update public.games set team_b_score = 7 where match_id = pg_temp.id('m2') and game_number = 2;
do $$ begin
  assert (select count(*) from public.match_audit_log where match_id = pg_temp.id('m2')) = 1, 'admin edit was not logged';
end $$;

-- Unanswered results expire as Unconfirmed after 72 hours.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into ids select 'c3', public.send_challenge(pg_temp.id('dj'), pg_temp.id('tr'), '00000000-0000-0000-0000-0000000000c1', now() + interval '1 hour');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select public.respond_to_challenge(pg_temp.id('c3'), true);
insert into ids select 'm3', public.submit_match_result(pg_temp.id('c3'), '[[11,2],[11,3]]');
reset role;
update public.matches set updated_at = now() - interval '73 hours' where id = pg_temp.id('m3');
do $$ begin
  assert public.expire_unanswered_results() = 1;
  assert (select status from public.matches where id = pg_temp.id('m3')) = 'unconfirmed';
end $$;

-- Blocked players can't challenge each other.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000b');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect_error($$select public.send_challenge(pg_temp.id('dj'), pg_temp.id('tr'), '00000000-0000-0000-0000-0000000000c1', now() + interval '1 hour')$$, 'You cannot challenge this team');

-- Looking to Play needs an end time within 24 hours; nearby search hides coordinates.
select pg_temp.expect_error($$select public.set_looking_to_play(true, now() + interval '3 days', 43.82, -111.79)$$, 'Pick an end time');
select public.set_looking_to_play(true, now() + interval '2 hours', 43.8231, -111.7924);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
do $$ begin
  assert (select count(*) from public.nearby_players(43.83, -111.79)) = 1;
  assert (select count(*) from public.player_locations) = 0, 'other players locations must not be readable';
  assert (select count(*) from public.search_players('dra')) = 1;
end $$;

\echo 'All Sickle database tests passed'

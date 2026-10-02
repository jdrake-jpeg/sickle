-- Verifies private ratings, the friend inbox, court conditions and the app's
-- challenge reads:
--   * only players in a confirmed match can rate each other; only the rated
--     player (and rater) can see it
--   * friend_activity shows games and ratings between two friends only
--   * condition reports are rate limited and fade after 6 hours
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000b3'), ('00000000-0000-0000-0000-0000000000b4'),
  ('00000000-0000-0000-0000-0000000000b5');
insert into public.profiles (id, username, display_name) values
  ('00000000-0000-0000-0000-0000000000b1', 'rateamy', 'Amy'),
  ('00000000-0000-0000-0000-0000000000b2', 'ratebo', 'Bo'),
  ('00000000-0000-0000-0000-0000000000b3', 'ratecy', 'Cy'),
  ('00000000-0000-0000-0000-0000000000b4', 'ratedi', 'Di'),
  ('00000000-0000-0000-0000-0000000000b5', 'rateed', 'Ed');
insert into public.courts (id, name, lat, lng, status) values
  ('00000000-0000-0000-0000-0000000000cc', 'Rating Court', 30, -100, 'approved');

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

create temp table rids (k text primary key, v uuid);
grant all on rids to authenticated;
create function pg_temp.r(p_k text) returns uuid language sql as $$ select v from rids where k = p_k $$;

set role authenticated;

-- Amy + Bo challenge Cy + Di; Cy accepts; Amy enters the score.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into rids select 'ab', public.create_team('00000000-0000-0000-0000-0000000000b2', 'Team AB');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b3';
insert into rids select 'cd', public.create_team('00000000-0000-0000-0000-0000000000b4');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into rids select 'ch', public.send_challenge(pg_temp.r('ab'), pg_temp.r('cd'), '00000000-0000-0000-0000-0000000000cc', now() + interval '1 hour');
do $$ begin
  assert (select count(*) from public.my_challenges()) = 1;
  assert (select i_challenged and my_team_name = 'Team AB' and their_team_name = 'Cy + Di' from public.my_challenges());
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b3';
select public.respond_to_challenge(pg_temp.r('ch'), true);
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into rids select 'm', public.submit_match_result(pg_temp.r('ch'), '[[11,7],[9,11],[11,8]]');

-- Cy sees it waiting on them, with scores from their side.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b3';
do $$ begin
  assert (select awaiting_me from public.my_challenges());
  assert (select games from public.my_challenges()) = '[[7,11],[11,9],[8,11]]'::jsonb;
end $$;

-- No rating before the score is confirmed.
select pg_temp.expect_error($$select public.rate_player(pg_temp.r('m'), '00000000-0000-0000-0000-0000000000b1', 3.0)$$, 'You can rate players once');
select public.confirm_match_result(pg_temp.r('m'));
do $$ begin assert (select not i_won from public.my_challenges()); end $$;

-- Cy rates Amy; outsiders and bad levels are rejected.
select pg_temp.expect_error($$select public.rate_player(pg_temp.r('m'), '00000000-0000-0000-0000-0000000000b1', 3.3)$$, 'Pick a level');
select pg_temp.expect_error($$select public.rate_player(pg_temp.r('m'), auth.uid(), 3.0)$$, 'Pick another player');
select pg_temp.expect_error($$select public.rate_player(pg_temp.r('m'), '00000000-0000-0000-0000-0000000000b5', 3.0)$$, 'Pick another player');
do $$ begin
  assert (select count(*) from public.match_people(pg_temp.r('m'))) = 3;
  assert (select teammate from public.match_people(pg_temp.r('m')) where display_name = 'Di');
end $$;
select public.rate_player(pg_temp.r('m'), '00000000-0000-0000-0000-0000000000b1', 3.0, 'Solid dinks');
select public.rate_player(pg_temp.r('m'), '00000000-0000-0000-0000-0000000000b1', 3.5, 'Actually better');
select pg_temp.expect_error($$insert into public.player_ratings (match_id, rater_id, ratee_id, skill) values (pg_temp.r('m'), auth.uid(), '00000000-0000-0000-0000-0000000000b2', 2.0)$$, 'permission denied');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b5';
select pg_temp.expect_error($$select public.rate_player(pg_temp.r('m'), '00000000-0000-0000-0000-0000000000b1', 3.0)$$, 'Only players in this match');
do $$ begin
  assert (select count(*) from public.player_ratings) = 0, 'ratings must be private';
  assert (select count(*) from public.match_people(pg_temp.r('m'))) = 0, 'outsiders see no roster';
end $$;

-- Amy sees one rating (the update replaced the first), averaged privately.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin
  assert (select ratings from public.my_rating_summary()) = 1;
  assert (select average from public.my_rating_summary()) = 3.5;
  assert (select received and other_name = 'Cy' and note = 'Actually better' from public.my_ratings());
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
do $$ begin assert (select count(*) from public.player_ratings) = 0, 'teammate must not see it'; end $$;

-- Friend inbox: only between friends.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
do $$ begin assert (select count(*) from public.friend_activity('00000000-0000-0000-0000-0000000000b3') where kind = 'game') = 0; end $$;
select public.add_friend('00000000-0000-0000-0000-0000000000b3');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b3';
select public.add_friend('00000000-0000-0000-0000-0000000000b1');
do $$ begin
  assert (select count(*) from public.friend_activity('00000000-0000-0000-0000-0000000000b1')) = 2;
  assert (select from_me from public.friend_activity('00000000-0000-0000-0000-0000000000b1') where kind = 'rating');
  assert (select not same_team and not from_me from public.friend_activity('00000000-0000-0000-0000-0000000000b1') where kind = 'game');
end $$;

-- Teams reads.
do $$ begin
  assert (select losses from public.my_teams()) = 1;
  assert (select count(*) from public.player_teams('00000000-0000-0000-0000-0000000000b1')) = 1;
end $$;

-- Court conditions: report, rate limit, fade after 6 hours.
select public.report_court_condition('00000000-0000-0000-0000-0000000000cc', 'wet', 'Puddles on court 2');
select pg_temp.expect_error($$select public.report_court_condition('00000000-0000-0000-0000-0000000000cc', 'icy')$$, 'You just reported');
select pg_temp.expect_error($$insert into public.court_condition_reports (court_id, reporter_id, condition) values ('00000000-0000-0000-0000-0000000000cc', auth.uid(), 'good')$$, 'permission denied');
do $$ begin
  assert (select condition from public.court_conditions('00000000-0000-0000-0000-0000000000cc')) = 'wet';
  assert (select count(*) from public.latest_court_conditions()) = 1;
end $$;
reset role;
update public.court_condition_reports set created_at = now() - interval '7 hours';
set role authenticated;
do $$ begin assert (select count(*) from public.latest_court_conditions()) = 0, 'old reports should fade'; end $$;

reset role;
reset request.jwt.claim.sub;
\echo 'Ratings and conditions tests passed'

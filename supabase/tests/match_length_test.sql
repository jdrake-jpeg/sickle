-- Verifies one game and best of 3 challenges:
--   * the challenger picks one game or best of 3; leaving it out means best of 3
--   * a one game match takes exactly one valid game, and best of 3 rules are unchanged
--   * a correction is checked against the same length
--   * a confirmed one game match counts toward records
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000ab01'), ('00000000-0000-0000-0000-00000000ab02'),
  ('00000000-0000-0000-0000-00000000ab03'), ('00000000-0000-0000-0000-00000000ab04');
insert into public.profiles (id, username, display_name) values
  ('00000000-0000-0000-0000-00000000ab01', 'lenone', 'Len One'),
  ('00000000-0000-0000-0000-00000000ab02', 'lentwo', 'Len Two'),
  ('00000000-0000-0000-0000-00000000ab03', 'lenthree', 'Len Three'),
  ('00000000-0000-0000-0000-00000000ab04', 'lenfour', 'Len Four');
insert into public.courts (id, name, lat, lng, status) values
  ('00000000-0000-0000-0000-00000000abcc', 'Length Court', 43.82, -111.79, 'approved');

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

-- Teams: One + Two, Three + Four.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ab01';
insert into ids values ('ab', public.create_team('00000000-0000-0000-0000-00000000ab02'));
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ab03';
insert into ids values ('cd', public.create_team('00000000-0000-0000-0000-00000000ab04'));

-- One + Two challenge Three + Four: once for one game, once the old way.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ab01';
select pg_temp.expect_error(
  $$select public.send_challenge(pg_temp.id('ab'), pg_temp.id('cd'), '00000000-0000-0000-0000-00000000abcc', now() + interval '1 day', 2::smallint)$$,
  'Pick one game or best of 3');
insert into ids select 'one', public.send_challenge(pg_temp.id('ab'), pg_temp.id('cd'), '00000000-0000-0000-0000-00000000abcc', now() + interval '1 day', 1::smallint);
insert into ids select 'three', public.send_challenge(pg_temp.id('ab'), pg_temp.id('cd'), '00000000-0000-0000-0000-00000000abcc', now() + interval '2 days');
do $$ begin
  assert (select best_of from public.my_challenges() where challenge_id = pg_temp.id('one')) = 1, 'one game challenge';
  assert (select best_of from public.my_challenges() where challenge_id = pg_temp.id('three')) = 3, 'leaving best_of out means best of 3';
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ab03';
select public.respond_to_challenge(pg_temp.id('one'), true);
select public.respond_to_challenge(pg_temp.id('three'), true);

-- Scores must fit the length.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ab01';
select pg_temp.expect_error($$select public.submit_match_result(pg_temp.id('one'), '[[11,7],[11,8]]')$$, 'A one game match has exactly 1 game');
select pg_temp.expect_error($$select public.submit_match_result(pg_temp.id('one'), '[[11,10]]')$$, 'Game 1 has an invalid score');
select pg_temp.expect_error($$select public.submit_match_result(pg_temp.id('three'), '[[11,7]]')$$, 'A best-of-3 match has 2 or 3 games');
insert into ids select 'm_one', public.submit_match_result(pg_temp.id('one'), '[[11,7]]');
insert into ids select 'm_three', public.submit_match_result(pg_temp.id('three'), '[[11,7],[8,11],[11,5]]');

-- A correction is checked against the same length, then the other team confirms.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ab03';
select pg_temp.expect_error($$select public.dispute_match_result(pg_temp.id('m_one'), '[[11,7],[11,5]]')$$, 'A one game match has exactly 1 game');
do $$ begin
  assert public.dispute_match_result(pg_temp.id('m_one'), '[[8,11]]') = 'awaiting_confirmation';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ab01';
select public.confirm_match_result(pg_temp.id('m_one'));

-- The corrected one game score (8 to 11) means Three + Four won.
do $$ begin
  assert (select wins from public.team_records where team_id = pg_temp.id('cd')) = 1, 'one game win counts';
  assert (select losses from public.team_records where team_id = pg_temp.id('ab')) = 1, 'one game loss counts';
end $$;

reset role;
reset request.jwt.claim.sub;
\echo 'Match length tests passed'

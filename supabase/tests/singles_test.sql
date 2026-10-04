-- Verifies singles:
--   * every profile gets a built in singles team (not listed in the old my_teams)
--   * singles only play singles; singles and doubles leaderboards are separate
--   * a one person team can be challenged, scored and confirmed like doubles
--   * outsiders still cannot rate players in a singles match
--   * history marks singles matches; the singles team can't be renamed or deleted
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000ad01'), ('00000000-0000-0000-0000-00000000ad02'),
  ('00000000-0000-0000-0000-00000000ad03'), ('00000000-0000-0000-0000-00000000ad04');
insert into public.profiles (id, username, display_name) values
  ('00000000-0000-0000-0000-00000000ad01', 'soloone', 'Solo One'),
  ('00000000-0000-0000-0000-00000000ad02', 'solotwo', 'Solo Two'),
  ('00000000-0000-0000-0000-00000000ad03', 'solothree', 'Solo Three'),
  ('00000000-0000-0000-0000-00000000ad04', 'solofour', 'Solo Four');
insert into public.courts (id, name, lat, lng, status) values
  ('00000000-0000-0000-0000-00000000adcc', 'Singles Court', 43.82, -111.79, 'approved');

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

-- Everyone already has a singles team.
do $$ begin
  assert (select count(*) from public.teams where player_high is null and player_low::text like '00000000-0000-0000-0000-00000000ad0%') = 4, 'four singles teams';
end $$;

-- Teams are friends only.
insert into public.friendships (requester_id, addressee_id, status, accepted_at) values
  ('00000000-0000-0000-0000-00000000ad01', '00000000-0000-0000-0000-00000000ad03', 'accepted', now()),
  ('00000000-0000-0000-0000-00000000ad04', '00000000-0000-0000-0000-00000000ad02', 'accepted', now());

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ad01';
do $$ begin
  assert (select count(*) from public.my_teams()) = 0, 'old my_teams skips singles';
  assert (select count(*) from public.my_teams_all()) = 1, 'my_teams_all has the singles team';
  assert (select is_singles from public.my_teams_all()), 'flagged as singles';
  assert (select team_name from public.my_teams_all()) = 'Solo One', 'singles team is named after the player';
  assert (select count(*) from public.player_teams('00000000-0000-0000-0000-00000000ad02')) = 0, 'old player_teams skips singles';
  assert (select count(*) from public.player_teams_all('00000000-0000-0000-0000-00000000ad02')) = 1, 'new one lists it';
end $$;
insert into ids select 'solo1', team_id from public.my_teams_all();
insert into ids select 'solo2', team_id from public.player_teams_all('00000000-0000-0000-0000-00000000ad02');
insert into ids values ('dbl', public.create_team('00000000-0000-0000-0000-00000000ad03'));
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ad04';
insert into ids values ('dbl2', public.create_team('00000000-0000-0000-0000-00000000ad02'));

-- Can't rename or delete the singles team.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ad01';
select pg_temp.expect_error($$select public.update_team_name(pg_temp.id('solo1'), 'Nope')$$, 'Your singles team is built in');
select pg_temp.expect_error($$select public.delete_team(pg_temp.id('solo1'))$$, 'Your singles team is built in');

-- Singles and doubles don't mix.
select pg_temp.expect_error(
  $$select public.send_challenge(pg_temp.id('solo1'), pg_temp.id('dbl2'), '00000000-0000-0000-0000-00000000adcc', now() + interval '1 day')$$,
  'Singles teams play singles');
select pg_temp.expect_error(
  $$select public.send_challenge(pg_temp.id('dbl'), pg_temp.id('solo2'), '00000000-0000-0000-0000-00000000adcc', now() + interval '1 day')$$,
  'Singles teams play singles');
select pg_temp.expect_error(
  $$select public.send_challenge(pg_temp.id('solo1'), pg_temp.id('solo1'), '00000000-0000-0000-0000-00000000adcc', now() + interval '1 day')$$,
  'A player cannot be on both teams');

-- Solo One beats Solo Two in one game.
insert into ids select 'c1', public.send_challenge(pg_temp.id('solo1'), pg_temp.id('solo2'), '00000000-0000-0000-0000-00000000adcc', now() + interval '1 day', 1::smallint);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ad02';
select public.respond_to_challenge(pg_temp.id('c1'), true);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ad01';
insert into ids select 'm1', public.submit_match_result(pg_temp.id('c1'), '[[11,6]]');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ad02';
select public.confirm_match_result(pg_temp.id('m1'));

do $$ begin
  assert (select count(*) from public.court_leaderboard('00000000-0000-0000-0000-00000000adcc', true)) = 2, 'singles board has both';
  assert (select team_name from public.court_leaderboard('00000000-0000-0000-0000-00000000adcc', true) where rank = 1) = 'Solo One', 'winner is first';
  assert (select count(*) from public.court_leaderboard('00000000-0000-0000-0000-00000000adcc', false)) = 0, 'doubles board is empty';
  assert (select count(*) from public.court_leaderboard('00000000-0000-0000-0000-00000000adcc')) = 0, 'old one argument board means doubles';
  assert (select wins from public.team_records where team_id = pg_temp.id('solo1')) = 1, 'singles team record';
end $$;

-- Ratings: only the two players can rate, and not an outsider.
select public.rate_player(pg_temp.id('m1'), '00000000-0000-0000-0000-00000000ad01', 3.5);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ad03';
select pg_temp.expect_error($$select public.rate_player(pg_temp.id('m1'), '00000000-0000-0000-0000-00000000ad01', 4.0)$$, 'Only players in this match can rate');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ad01';
do $$ begin
  assert (select count(*) from public.match_people(pg_temp.id('m1'))) = 1, 'one other player in a singles match';
  assert (select not teammate from public.match_people(pg_temp.id('m1'))), 'no teammate in singles';
end $$;

-- History says singles and has no partner.
do $$ begin
  assert (select is_singles from public.player_history('00000000-0000-0000-0000-00000000ad01')), 'history flagged singles';
  assert (select with_name is null from public.player_history('00000000-0000-0000-0000-00000000ad01')), 'no partner';
  assert (select opponent_name from public.player_history('00000000-0000-0000-0000-00000000ad01')) = 'Solo Two', 'opponent';
  assert (select count(*) from public.team_history(pg_temp.id('solo1'))) = 1, 'team history of a singles team';
  assert (select jsonb_array_length(members) from public.team_detail(pg_temp.id('solo1'))) = 1, 'one member';
end $$;

reset role;
reset request.jwt.claim.sub;
\echo 'Singles tests passed'

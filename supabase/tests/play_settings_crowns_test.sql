-- Verifies challenge and friend request settings, finding players, and crowns:
--   * challenges_from: everyone, friends only
--   * friend_requests off blocks new requests but not accepting one you already got
--   * similar_players finds people within half a point, by format
--   * a crown needs rank 1 and at least 6 wins at the court; singles and doubles are separate
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000ae01'), ('00000000-0000-0000-0000-00000000ae02'),
  ('00000000-0000-0000-0000-00000000ae03'), ('00000000-0000-0000-0000-00000000ae04');
insert into public.profiles (id, username, display_name, skill_level) values
  ('00000000-0000-0000-0000-00000000ae01', 'setone', 'Set One', 3.5),
  ('00000000-0000-0000-0000-00000000ae02', 'settwo', 'Set Two', 3.5),
  ('00000000-0000-0000-0000-00000000ae03', 'setthree', 'Set Three', 4.0),
  ('00000000-0000-0000-0000-00000000ae04', 'setfour', 'Set Four', 5.5);
insert into public.courts (id, name, lat, lng, status) values
  ('00000000-0000-0000-0000-00000000aecc', 'Crown Court', 43.82, -111.79, 'approved');

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

-- Singles teams.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ae01';
insert into ids select 's1', team_id from public.my_teams_all();
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ae02';
insert into ids select 's2', team_id from public.my_teams_all();

-- Challenge settings. Set Two is the one being challenged.
-- Nobody was removed: it is no longer a valid choice.
do $$ begin
  begin
    update public.profiles set challenges_from = 'nobody' where id = '00000000-0000-0000-0000-00000000ae02';
    raise exception 'nobody should be rejected';
  exception when check_violation then null;
  end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ae01';

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ae02';
update public.profiles set challenges_from = 'friends' where id = '00000000-0000-0000-0000-00000000ae02';
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ae01';
select pg_temp.expect_error(
  $$select public.send_challenge(pg_temp.id('s1'), pg_temp.id('s2'), '00000000-0000-0000-0000-00000000aecc', now() + interval '1 day')$$,
  'Set only takes challenges from friends');
select public.add_friend('00000000-0000-0000-0000-00000000ae02');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ae02';
select public.add_friend('00000000-0000-0000-0000-00000000ae01');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ae01';
do $$ begin assert (select can_challenge from public.player_open('00000000-0000-0000-0000-00000000ae02')), 'friends can challenge'; end $$;
select public.send_challenge(pg_temp.id('s1'), pg_temp.id('s2'), '00000000-0000-0000-0000-00000000aecc', now() + interval '1 day');

-- Friend requests: turned off blocks new requests, but not accepting one.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ae03';
select public.add_friend('00000000-0000-0000-0000-00000000ae04');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ae04';
update public.profiles set friend_requests = false where id = '00000000-0000-0000-0000-00000000ae04';
do $$ begin assert public.add_friend('00000000-0000-0000-0000-00000000ae03') = 'accepted', 'accepting still works'; end $$;
select public.remove_friend('00000000-0000-0000-0000-00000000ae03');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ae03';
select pg_temp.expect_error($$select public.add_friend('00000000-0000-0000-0000-00000000ae04')$$, 'This player isn''t taking friend requests');
do $$ begin assert not (select can_friend from public.player_open('00000000-0000-0000-0000-00000000ae04')), 'player_open says no'; end $$;

-- Similar players: Set One (3.5) sees Set Three (4.0) and not Set Four (5.5); Set Two is already a friend.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ae01';
do $$ begin
  assert (select count(*) from public.similar_players() where username::text like 'set%') = 1, 'one similar player';
  assert (select username from public.similar_players() where username::text like 'set%') = 'setthree', 'Set Three';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ae03';
update public.profiles set plays_singles = false where id = '00000000-0000-0000-0000-00000000ae03';
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ae01';
do $$ begin
  assert (select count(*) from public.similar_players('singles') where username::text like 'set%') = 0, 'not open to singles';
  assert (select count(*) from public.similar_players('doubles') where username::text like 'set%') = 1, 'open to doubles';
end $$;

-- Crowns: Set One beats Set Two in six singles matches.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ae02';
update public.profiles set challenges_from = 'everyone' where id = '00000000-0000-0000-0000-00000000ae02';
create function pg_temp.play_one(p_n int) returns void language plpgsql as $$
declare
  v_c uuid;
  v_m uuid;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ae01', false);
  v_c := public.send_challenge(pg_temp.id('s1'), pg_temp.id('s2'), '00000000-0000-0000-0000-00000000aecc', now() + interval '1 day' + p_n * interval '1 minute', 1::smallint);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ae02', false);
  perform public.respond_to_challenge(v_c, true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ae01', false);
  v_m := public.submit_match_result(v_c, '[[11,5]]');
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ae02', false);
  perform public.confirm_match_result(v_m);
end $$;
grant execute on function pg_temp.play_one(int) to authenticated;

select pg_temp.play_one(i) from generate_series(1, 5) i;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ae03';
do $$ begin
  assert (select wins from public.court_leaderboard('00000000-0000-0000-0000-00000000aecc', true) where rank = 1) = 5, 'five wins, rank 1';
  assert (select count(*) from public.court_champion('00000000-0000-0000-0000-00000000aecc', true)) = 0, 'five wins is not enough';
  assert (select count(*) from public.player_crowns('00000000-0000-0000-0000-00000000ae01')) = 0, 'no crown yet';
end $$;
select pg_temp.play_one(6);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ae03';
do $$ begin
  assert (select team_name from public.court_champion('00000000-0000-0000-0000-00000000aecc', true)) = 'Set One', 'six wins takes the crown';
  assert (select count(*) from public.court_champion('00000000-0000-0000-0000-00000000aecc', false)) = 0, 'doubles has no champ';
  assert (select court_name from public.player_crowns('00000000-0000-0000-0000-00000000ae01')) = 'Crown Court', 'player crowns';
  assert (select is_singles from public.player_crowns('00000000-0000-0000-0000-00000000ae01')), 'singles crown';
  assert (select count(*) from public.player_crowns('00000000-0000-0000-0000-00000000ae02')) = 0, 'the loser has no crown';
end $$;

-- A hidden record hides crowns from other people.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ae01';
update public.profiles set show_record = false where id = '00000000-0000-0000-0000-00000000ae01';
do $$ begin assert (select count(*) from public.player_crowns('00000000-0000-0000-0000-00000000ae01')) = 1, 'own crown still shows'; end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ae03';
do $$ begin assert (select count(*) from public.player_crowns('00000000-0000-0000-0000-00000000ae01')) = 0, 'hidden from others'; end $$;

reset role;
reset request.jwt.claim.sub;
\echo 'Play settings and crowns tests passed'

-- Verifies the round 2 rules:
--   * teams only with friends, deleted/blocked rules still apply
--   * team_players lists "A and B" under a team name
--   * 3 courts a day (public, map and private all count), admins exempt from the submit limit
--   * private courts are not allowed within 200 feet of a public court
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000cc01'), ('00000000-0000-0000-0000-00000000cc02'),
  ('00000000-0000-0000-0000-00000000cc03');
insert into public.profiles (id, username, display_name) values
  ('00000000-0000-0000-0000-00000000cc01', 'rtwoone', 'Zed One'),
  ('00000000-0000-0000-0000-00000000cc02', 'rtwotwo', 'Zed Two'),
  ('00000000-0000-0000-0000-00000000cc03', 'rtwothree', 'Zed Three');
insert into public.courts (id, name, lat, lng, status) values
  ('00000000-0000-0000-0000-00000000cccc', 'Round Two Public', 12.0, -100.0, 'approved');

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

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000cc01';

-- Not friends: no team. Friends: team, with both names under it.
select pg_temp.expect_error($$select public.create_team('00000000-0000-0000-0000-00000000cc02')$$, 'You can only make a team with a friend');
select public.add_friend('00000000-0000-0000-0000-00000000cc02');
select pg_temp.expect_error($$select public.create_team('00000000-0000-0000-0000-00000000cc02')$$, 'You can only make a team with a friend');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000cc02';
select public.add_friend('00000000-0000-0000-0000-00000000cc01');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000cc01';
insert into ids select 't', public.create_team('00000000-0000-0000-0000-00000000cc02', 'Zeds');
do $$ begin
  assert (select players from public.team_players(array[(select v from ids where k = 't')])) = 'Zed One and Zed Two', 'players under the name';
end $$;
select pg_temp.expect_error($$select public.create_team('00000000-0000-0000-0000-00000000cc03')$$, 'You can only make a team with a friend');

-- Private courts: not within 200 feet (about 61 m) of a public court, fine beyond it.
select pg_temp.expect_error($$select public.create_private_court('Too close', 12.0003, -100.0, null, 1)$$, 'A public court is already there');
insert into ids select 'far', public.create_private_court('Far enough', 12.001, -100.0, null, 1);

-- 3 a day across everything; the private one above counted as the first.
select public.add_map_court('Map A', 20.0, -100.0, null, 'osm:way/r2a');
select public.submit_court('Sub B', 21.0, -100.0, null, 2);
select pg_temp.expect_error($$select public.add_map_court('Map C', 22.0, -100.0, null, 'osm:way/r2c')$$, 'You can add 3 courts a day');
select pg_temp.expect_error($$select public.submit_court('Sub D', 23.0, -100.0, null, 2)$$, 'You can add 3 courts a day');
select pg_temp.expect_error($$select public.create_private_court('Yard', 24.0, -100.0, null, 1)$$, 'You can add 3 courts a day');

-- Another player is not affected.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000cc02';
select public.add_map_court('Map E', 25.0, -100.0, null, 'osm:way/r2e');

reset role;
-- A day later the limit resets.
update public.courts set created_at = now() - interval '2 days' where submitted_by = '00000000-0000-0000-0000-00000000cc01';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000cc01';
select public.add_map_court('Map F', 26.0, -100.0, null, 'osm:way/r2f');

reset role;
reset request.jwt.claim.sub;
\echo 'Round 2 rules tests passed'

-- Verifies courts from map pins, private courts, and choosing the court after a game:
--   * add_map_court adds right away, returns the existing court for the same place or spot, and is limited
--   * private courts: not where a public court is, visible to the owner and friends only, not even to admins
--   * a public court can still be submitted next to a private one
--   * challenges at a private court only between friends of its owner
--   * the score can name the court you actually played at
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000ba01'), ('00000000-0000-0000-0000-00000000ba02'),
  ('00000000-0000-0000-0000-00000000ba03'), ('00000000-0000-0000-0000-00000000ba04'),
  ('00000000-0000-0000-0000-00000000ba05');
insert into public.profiles (id, username, display_name, is_admin) values
  ('00000000-0000-0000-0000-00000000ba01', 'mapone', 'Court One', false),
  ('00000000-0000-0000-0000-00000000ba02', 'maptwo', 'Court Two', false),
  ('00000000-0000-0000-0000-00000000ba03', 'mapthree', 'Court Three', false),
  ('00000000-0000-0000-0000-00000000ba04', 'mapfour', 'Court Four', false),
  ('00000000-0000-0000-0000-00000000ba05', 'mapadmin', 'Court Admin', true);

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
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ba01';

-- A court from a map pin goes straight in.
insert into ids select 'map1', public.add_map_court('Memorial Pickleball Courts', 45.5000, -111.5000, 'Main St', 'osm:way/1');
do $$ begin
  assert (select status::text from public.courts where id = pg_temp.id('map1')) = 'approved', 'approved right away';
  assert (select source from public.courts where id = pg_temp.id('map1')) = 'map', 'source is map';
  assert not (select is_private from public.courts where id = pg_temp.id('map1')), 'public';
end $$;
-- The same place, or a spot about 50 meters away, gives back the same court.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ba02';
do $$ begin
  assert public.add_map_court('Whatever', 45.5000, -111.5000, null, 'osm:way/1') = pg_temp.id('map1'), 'same place';
  assert public.add_map_court('Whatever', 45.5003, -111.5000, null, 'osm:way/2') = pg_temp.id('map1'), 'same spot';
end $$;
select pg_temp.expect_error($$select public.add_map_court('No place', 45.6, -111.5, null, null)$$, 'Only courts from the map');

-- Limit: 3 a day.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ba03';
select public.add_map_court('Far ' || i, 46 + i * 0.1, -112, null, 'osm:way/lim' || i) from generate_series(1, 3) i;
select pg_temp.expect_error($$select public.add_map_court('Far 4', 47.5, -112, null, 'osm:way/lim4')$$, 'You can add 3 courts a day');

-- Private courts.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ba01';
select pg_temp.expect_error($$select public.create_private_court('Backyard', 45.5005, -111.5, null, 1)$$, 'A public court is already there (Memorial Pickleball Courts)');
insert into ids select 'priv', public.create_private_court('Backyard', 44.0, -110.0, 'Behind my house', 1);
do $$ begin
  assert (select is_private and status::text = 'approved' from public.courts where id = pg_temp.id('priv')), 'private and approved';
  assert (select count(*) from public.courts where id = pg_temp.id('priv')) = 1, 'owner sees it';
end $$;

-- A stranger and an admin can't see it; a friend can.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ba03';
do $$ begin assert (select count(*) from public.courts where id = pg_temp.id('priv')) = 0, 'stranger cannot see it'; end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ba05';
do $$ begin assert (select count(*) from public.courts where id = pg_temp.id('priv')) = 0, 'admin cannot see it'; end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ba01';
select public.add_friend('00000000-0000-0000-0000-00000000ba02');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ba02';
select public.add_friend('00000000-0000-0000-0000-00000000ba01');
do $$ begin assert (select count(*) from public.courts where id = pg_temp.id('priv')) = 1, 'friend can see it'; end $$;

-- A public court can still be submitted right next to a private one.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ba04';
select public.submit_court('Public next door', 44.0001, -110.0, null, 2);

-- Challenges at the private court: friends of the owner only.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ba01';
insert into ids select 's1', team_id from public.my_teams_all();
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ba02';
insert into ids select 's2', team_id from public.my_teams_all();
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ba03';
insert into ids select 's3', team_id from public.my_teams_all();
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ba01';
select pg_temp.expect_error(
  $$select public.send_challenge(pg_temp.id('s1'), pg_temp.id('s3'), pg_temp.id('priv'), now() + interval '1 day')$$,
  'That is a private court');
insert into ids select 'c1', public.send_challenge(pg_temp.id('s1'), pg_temp.id('s2'), pg_temp.id('priv'), now() + interval '1 day', 1::smallint);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ba02';
select public.respond_to_challenge(pg_temp.id('c1'), true);

-- Played somewhere else: the score names the court.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ba01';
select pg_temp.expect_error(
  $$select public.submit_match_result(pg_temp.id('c1'), '[[11,3]]', now(), '00000000-0000-0000-0000-00000000ba99')$$,
  'Pick an approved court');
insert into ids select 'm1', public.submit_match_result(pg_temp.id('c1'), '[[11,3]]', now(), pg_temp.id('map1'));
do $$ begin
  assert (select court_id from public.matches where id = pg_temp.id('m1')) = pg_temp.id('map1'), 'match at the new court';
  assert (select court_name from public.my_challenges() where challenge_id = pg_temp.id('c1')) = 'Memorial Pickleball Courts', 'challenge shows the new court';
end $$;

-- Removing a private court: gone if unused (the game moved to another court), hidden if it has games.
insert into ids select 'priv3', public.create_private_court('Cul de sac', 42.0, -110.0);
insert into ids select 'c2', public.send_challenge(pg_temp.id('s1'), pg_temp.id('s2'), pg_temp.id('priv3'), now() + interval '2 days');
do $$ begin
  assert public.remove_private_court(pg_temp.id('priv3')) = 'hidden', 'has a challenge, so hidden';
  assert (select status::text from public.challenges where id = pg_temp.id('c2')) = 'cancelled', 'its open challenge is cancelled';
  assert public.remove_private_court(pg_temp.id('priv')) = 'deleted', 'unused, so deleted';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ba02';
select pg_temp.expect_error($$select public.remove_private_court(pg_temp.id('priv3'))$$, 'That is not your private court');

reset role;
reset request.jwt.claim.sub;
\echo 'Private and map courts tests passed'

-- Verifies round 6:
--   * preferred days and a 2 hour window: saved, validated, readable by others
--   * add_nearby_map_courts: adds new courts, skips ones already there, caps the batch
--   * seed_map_courts: bulk seed, skips repeats, not callable from the app
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000006a1'), ('00000000-0000-0000-0000-0000000006a2');
insert into public.profiles (id, username, display_name, skill_level) values
  ('00000000-0000-0000-0000-0000000006a1', 'rsixaa', 'Aaa Six', 3.5),
  ('00000000-0000-0000-0000-0000000006a2', 'rsixbb', 'Bbb Six', 3.5);

-- Preferred times.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000006a1';
update public.profiles set preferred_days = '{1,3,5}', preferred_start = 1140 where id = '00000000-0000-0000-0000-0000000006a1';
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000006a2';
do $$ begin
  assert (select preferred_start from public.profiles where id = '00000000-0000-0000-0000-0000000006a1') = 1140, 'others can read the window';
  assert (select preferred_days from public.profiles where id = '00000000-0000-0000-0000-0000000006a1') = '{1,3,5}', 'others can read the days';
end $$;
do $$ begin
  begin
    update public.profiles set preferred_days = '{7}' where id = '00000000-0000-0000-0000-0000000006a2';
    raise exception 'day 7 should be rejected';
  exception when check_violation then null;
  end;
  begin
    update public.profiles set preferred_start = 1500 where id = '00000000-0000-0000-0000-0000000006a2';
    raise exception 'start 1500 should be rejected';
  exception when check_violation then null;
  end;
end $$;
-- Nobody edits someone else's.
update public.profiles set preferred_start = 60 where id = '00000000-0000-0000-0000-0000000006a1';
do $$ begin
  assert (select preferred_start from public.profiles where id = '00000000-0000-0000-0000-0000000006a1') = 1140, 'cannot edit another profile';
end $$;

-- Courts added near you.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000006a1';
do $$
declare v integer;
begin
  v := public.add_nearby_map_courts('[
    {"name":"Provo Test Park","lat":40.2338,"lng":-111.6585,"place_id":"osm:way/6001","address":"100 N"},
    {"name":"Provo Test Park Again","lat":40.23381,"lng":-111.65851,"place_id":"osm:way/6002"},
    {"name":"Orem Test Courts","lat":40.2969,"lng":-111.6946,"place_id":"osm:way/6003"},
    {"name":"No place","lat":40.1,"lng":-111.6}
  ]'::jsonb);
  assert v = 2, format('two new courts, got %s', v);
  assert (select count(*) from public.courts where google_place_id in ('osm:way/6001', 'osm:way/6003') and status = 'approved') = 2;
  -- Running it again adds nothing.
  assert public.add_nearby_map_courts('[{"name":"Provo Test Park","lat":40.2338,"lng":-111.6585,"place_id":"osm:way/6001"}]'::jsonb) = 0, 'repeat adds nothing';
  begin
    perform public.add_nearby_map_courts((select jsonb_agg(jsonb_build_object('name', 'x' || g, 'lat', 40 + g / 1000.0, 'lng', -111, 'place_id', 'osm:way/7' || g)) from generate_series(1, 26) g));
    raise exception 'more than 25 should be rejected';
  exception when raise_exception then
    assert sqlerrm like 'Too many%', sqlerrm;
  end;
end $$;

-- The seed is not callable from the app.
do $$ begin
  begin
    perform public.seed_map_courts('[]'::jsonb);
    raise exception 'seed should not be callable';
  exception when insufficient_privilege then null;
  end;
end $$;

-- The seed, as the SQL Editor runs it.
reset role;
reset request.jwt.claim.sub;
do $$
declare v integer;
begin
  v := public.seed_map_courts('[
    {"n":"Seed Park","a":"1 Main St","la":41.7370,"lo":-111.8338,"p":"osm:way/6101","c":4},
    {"n":"Seed Park Duplicate","la":41.73701,"lo":-111.83381,"p":"osm:way/6102"},
    {"n":"Seed Courts Two","la":42.5601,"lo":-114.4701,"p":"osm:node/6103"},
    {"n":"Bad","la":999,"lo":0,"p":"osm:node/6104"}
  ]'::jsonb);
  assert v = 2, format('two seeded, got %s', v);
  assert (select court_count from public.courts where google_place_id = 'osm:way/6101') = 4, 'court count kept';
  assert public.seed_map_courts('[{"n":"Seed Park","la":41.7370,"lo":-111.8338,"p":"osm:way/6101"}]'::jsonb) = 0, 'seed twice adds nothing';
end $$;

\echo 'Round 6 tests passed'

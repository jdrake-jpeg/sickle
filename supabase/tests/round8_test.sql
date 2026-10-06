-- Verifies round 8 (no home courts):
--   * is_home_court_name flags generic and home names, not real parks
--   * add_nearby_map_courts and seed_map_courts refuse them
--   * the one time cleanup deleted/hid the right courts and left manual courts alone
--   * an admin removed mapped court is hidden and never added back
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000008a1'), ('00000000-0000-0000-0000-0000000008a2'),
  ('00000000-0000-0000-0000-0000000008a3'), ('00000000-0000-0000-0000-0000000008a4');
insert into public.profiles (id, username, display_name, skill_level, is_admin) values
  ('00000000-0000-0000-0000-0000000008a1', 'reightaa', 'Aaa Eight', 3.5, false),
  ('00000000-0000-0000-0000-0000000008a2', 'reightbb', 'Bbb Eight', 3.5, true),
  ('00000000-0000-0000-0000-0000000008a3', 'reightcc', 'Ccc Eight', 3.5, false),
  ('00000000-0000-0000-0000-0000000008a4', 'reightdd', 'Ddd Eight', 3.5, false);
insert into public.teams (id, player_low, player_high, created_by) values
  ('00000000-0000-0000-0000-0000000008b1', '00000000-0000-0000-0000-0000000008a1', '00000000-0000-0000-0000-0000000008a2', '00000000-0000-0000-0000-0000000008a1'),
  ('00000000-0000-0000-0000-0000000008b2', '00000000-0000-0000-0000-0000000008a3', '00000000-0000-0000-0000-0000000008a4', '00000000-0000-0000-0000-0000000008a3');

do $$ begin
  assert public.is_home_court_name('Pickleball courts');
  assert public.is_home_court_name('Pickleball courts on Maple St');
  assert public.is_home_court_name('The Smith Residence Court');
  assert public.is_home_court_name('Backyard courts');
  assert not public.is_home_court_name('Pickleball courts at Fake Park');
  assert not public.is_home_court_name('Lehi Rec Pickleball Courts');
  assert not public.is_home_court_name('Homestead Park');
end $$;

-- Old data, as the earlier seed left it: generic and home ones, a real one,
-- one with history, and a court somebody added by hand.
insert into public.courts (id, name, lat, lng, status, source, google_place_id) values
  ('00000000-0000-0000-0000-0000000008c1', 'Pickleball courts', 46.1001, -112.1001, 'approved', 'map', 'osm:way/8001'),
  ('00000000-0000-0000-0000-0000000008c2', 'Pickleball courts on Elm St', 46.2001, -112.2001, 'approved', 'map', 'osm:way/8002'),
  ('00000000-0000-0000-0000-0000000008c3', 'Real Park Courts', 46.3001, -112.3001, 'approved', 'map', 'osm:way/8003'),
  ('00000000-0000-0000-0000-0000000008c4', 'Pickleball courts', 46.4001, -112.4001, 'approved', 'map', 'osm:way/8004');
insert into public.courts (id, name, lat, lng, status, source, submitted_by, submission_note) values
  ('00000000-0000-0000-0000-0000000008c5', 'Pickleball courts', 46.5001, -112.5001, 'approved', 'manual', '00000000-0000-0000-0000-0000000008a1', 'mine');
insert into public.challenges (challenger_team_id, challenged_team_id, court_id, proposed_time, created_by) values
  ('00000000-0000-0000-0000-0000000008b1', '00000000-0000-0000-0000-0000000008b2', '00000000-0000-0000-0000-0000000008c4', now(), '00000000-0000-0000-0000-0000000008a1');

-- The cleanup (same statements as the migration).
update public.courts
set status = 'rejected', reviewed_at = now(), review_note = 'Removed: home or unnamed court'
where source = 'map' and google_place_id like 'osm:%' and status <> 'rejected'
  and public.is_home_court_name(name)
  and (exists (select 1 from public.challenges h where h.court_id = courts.id)
       or exists (select 1 from public.matches m where m.court_id = courts.id));
delete from public.courts
where source = 'map' and google_place_id like 'osm:%' and status <> 'rejected'
  and public.is_home_court_name(name);

do $$ begin
  assert not exists (select 1 from public.courts where id in ('00000000-0000-0000-0000-0000000008c1', '00000000-0000-0000-0000-0000000008c2')), 'generic ones deleted';
  assert (select status from public.courts where id = '00000000-0000-0000-0000-0000000008c3') = 'approved', 'real park kept';
  assert (select status from public.courts where id = '00000000-0000-0000-0000-0000000008c4') = 'rejected', 'one with history is hidden';
  assert (select status from public.courts where id = '00000000-0000-0000-0000-0000000008c5') = 'approved', 'manual court untouched';
end $$;

-- The adders refuse home courts and hidden ones.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000008a1';
do $$
declare v integer;
begin
  v := public.add_nearby_map_courts('[
    {"name":"Pickleball courts","lat":44.1,"lng":-113.1,"place_id":"osm:way/8101"},
    {"name":"Jones Backyard Court","lat":44.2,"lng":-113.2,"place_id":"osm:way/8102"},
    {"name":"Pickleball courts","lat":46.4001,"lng":-112.4001,"place_id":"osm:way/8004"},
    {"name":"Good Park Courts","lat":44.3,"lng":-113.3,"place_id":"osm:way/8103"}
  ]'::jsonb);
  assert v = 1, format('only the park, got %s', v);
end $$;
reset role;
reset request.jwt.claim.sub;

do $$
declare v integer;
begin
  v := public.seed_map_courts('[
    {"n":"Pickleball courts","la":43.1,"lo":-114.1,"p":"osm:way/8201"},
    {"n":"Pickleball courts at Fake Park","la":43.2,"lo":-114.2,"p":"osm:way/8202"},
    {"n":"Smith House Courts","la":43.3,"lo":-114.3,"p":"osm:way/8203"},
    {"n":"Pickleball courts at Hidden","la":46.4001,"lo":-112.4001,"p":"osm:way/8004"}
  ]'::jsonb);
  assert v = 1, format('only the park one seeds, got %s', v);
end $$;

-- An admin removing a mapped court hides it, and the map never adds it back.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000008a2';
do $$
declare v_court uuid; v_res text;
begin
  select id into v_court from public.courts where google_place_id = 'osm:way/8103';
  v_res := public.admin_remove_court(v_court);
  assert v_res = 'hidden', v_res;
  assert (select status from public.courts where id = v_court) = 'rejected';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000008a1';
do $$ begin
  assert public.add_nearby_map_courts('[{"name":"Good Park Courts","lat":44.3,"lng":-113.3,"place_id":"osm:way/8103"}]'::jsonb) = 0, 'removed court stays gone';
end $$;
reset role;
reset request.jwt.claim.sub;

\echo 'Round 8 tests passed'

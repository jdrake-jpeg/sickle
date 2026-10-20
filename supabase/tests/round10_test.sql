-- Verifies round 10:
--   * logged games count at once, anyone in them can edit, link to anyone
--   * partner picked later for a doubles challenge
--   * preferred time ranges, username edits
--   * recent players, reports for admins, removed courts remembered
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000010a'), ('00000000-0000-0000-0000-00000000010b'),
  ('00000000-0000-0000-0000-00000000010c'), ('00000000-0000-0000-0000-00000000010d'),
  ('00000000-0000-0000-0000-00000000010e');
insert into public.profiles (id, username, display_name) values
  ('00000000-0000-0000-0000-00000000010a', 'rtena', 'Aaa Ten'),
  ('00000000-0000-0000-0000-00000000010b', 'rtenb', 'Bbb Ten'),
  ('00000000-0000-0000-0000-00000000010c', 'rtenc', 'Ccc Ten'),
  ('00000000-0000-0000-0000-00000000010d', 'rtend', 'Ddd Ten'),
  ('00000000-0000-0000-0000-00000000010e', 'rtene', 'Eee Ten');
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-00000000010e';
insert into public.courts (id, name, lat, lng, status, google_place_id, source) values
  ('00000000-0000-0000-0000-0000000010cc', 'Ten Court', 43.82, -111.79, 'approved', null, 'manual'),
  ('00000000-0000-0000-0000-0000000010cd', 'Ten Pin', 43.90, -111.80, 'approved', 'place-ten', 'map');
insert into public.friendships (requester_id, addressee_id, status, accepted_at) values
  ('00000000-0000-0000-0000-00000000010a', '00000000-0000-0000-0000-00000000010b', 'accepted', now()),
  ('00000000-0000-0000-0000-00000000010a', '00000000-0000-0000-0000-00000000010c', 'accepted', now()),
  ('00000000-0000-0000-0000-00000000010a', '00000000-0000-0000-0000-00000000010d', 'accepted', now()),
  ('00000000-0000-0000-0000-00000000010d', '00000000-0000-0000-0000-00000000010c', 'accepted', now());

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000010f1');
insert into public.profiles (id, username, display_name, is_placeholder, owner_id) values
  ('00000000-0000-0000-0000-0000000010f1', 'rtengh', 'Ghost Ten', true, '00000000-0000-0000-0000-00000000010e');

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
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000010a';

-- Preferred times: from and until.
update public.profiles set preferred_windows = '{"1": 720, "3": 0}', preferred_ends = '{"1": 1200, "3": 1440}' where id = auth.uid();
select pg_temp.expect_error($$update public.profiles set preferred_ends = '{"1": 10}' where id = auth.uid()$$, 'new row for relation "profiles" violates check constraint "profiles_preferred_ends_check"');
select pg_temp.expect_error($$update public.profiles set preferred_windows = '{"1": 1439}' where id = auth.uid()$$, 'new row for relation "profiles" violates check constraint "profiles_preferred_windows_check"');

-- Log a game with a real friend: counts at once and the friend hears about it.
insert into ids values ('g1', public.log_game('00000000-0000-0000-0000-0000000010cc', now() - interval '1 hour', 1::smallint, '[[11,8]]'::jsonb,
  null, '00000000-0000-0000-0000-00000000010b', null));
do $$
declare r record;
begin
  select * into r from public.my_challenges() where challenge_id = pg_temp.id('g1');
  assert r.match_status = 'confirmed' and r.status = 'completed' and not r.awaiting_me, 'counts at once';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000010b';
do $$
declare r record;
begin
  select * into r from public.my_challenges() where challenge_id = pg_temp.id('g1');
  assert r.match_status = 'confirmed' and not r.awaiting_me, 'friend has nothing to confirm';
  -- and can fix it right away
  insert into ids select 'm1', r.match_id;
  assert public.propose_match_change(r.match_id, 'edit', '[[8,11]]'::jsonb) = 'applied', 'friend fixes it';
end $$;
reset role;
do $$ begin assert exists (select 1 from public.notifications where profile_id = '00000000-0000-0000-0000-00000000010b'), 'friend was notified'; end $$;
set role authenticated;

-- Recent players: B shows up for A, E never.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000010a';
do $$ begin
  assert exists (select 1 from public.recent_players() where profile_id = '00000000-0000-0000-0000-00000000010b'), 'B is recent';
  assert not exists (select 1 from public.recent_players() where profile_id = '00000000-0000-0000-0000-00000000010e'), 'E is not';
end $$;

-- A doubles challenge sent before the partner is known.
insert into ids select 'single', team_id from public.my_teams_all() where is_singles;
insert into ids values ('c1', public.send_challenge_to_player(pg_temp.id('single'), '00000000-0000-0000-0000-00000000010d', '00000000-0000-0000-0000-0000000010cc', now() + interval '1 day', 3::smallint));
do $$
declare r record;
begin
  select * into r from public.my_challenges() where challenge_id = pg_temp.id('c1');
  assert r.challenger_needs_partner and r.my_team_name like '% + partner TBD', 'my side shows partner TBD';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000010d';
do $$
declare r record;
begin
  select * into r from public.my_challenges() where challenge_id = pg_temp.id('c1');
  assert r.their_team_name like '% + partner TBD', 'they see it too';
end $$;
select pg_temp.expect_error(format($$select public.set_challenge_partner(%L, %L)$$, pg_temp.id('c1'), '00000000-0000-0000-0000-00000000010c'), 'Only the player who sent it');
insert into ids values ('dteam', public.accept_challenge_with_partner(pg_temp.id('c1'), '00000000-0000-0000-0000-00000000010c'));
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000010a';
select pg_temp.expect_error(format($$select public.submit_match_result(%L, '[[11,5]]'::jsonb, now(), null)$$, pg_temp.id('c1')), 'Pick your partner');
select pg_temp.expect_error(format($$select public.set_challenge_partner(%L, %L)$$, pg_temp.id('c1'), '00000000-0000-0000-0000-0000000010f1'), 'Your partner has to be');
select pg_temp.expect_error(format($$select public.set_challenge_partner(%L, %L)$$, pg_temp.id('c1'), '00000000-0000-0000-0000-00000000010c'), 'A player cannot be on both teams');
insert into ids values ('ateam', public.set_challenge_partner(pg_temp.id('c1'), '00000000-0000-0000-0000-00000000010b'));
do $$
declare r record;
begin
  select * into r from public.my_challenges() where challenge_id = pg_temp.id('c1');
  assert not r.challenger_needs_partner and r.my_team_id = pg_temp.id('ateam'), 'partner set';
end $$;

-- Usernames can change and stay unique.
update public.profiles set username = 'rtenaa' where id = auth.uid();
select pg_temp.expect_error($$update public.profiles set username = 'rtenb' where id = auth.uid()$$, 'duplicate key value');

-- Reports reach admins; an avatar can be taken down.
insert into public.reports (reporter_id, reported_profile_id, reason, kind) values (auth.uid(), '00000000-0000-0000-0000-00000000010c', 'bad picture', 'avatar');
select pg_temp.expect_error($$select * from public.admin_reports()$$, 'Only admins');
reset role;
update public.profiles set avatar_url = 'http://x/y.png' where id = '00000000-0000-0000-0000-00000000010c';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000010e';
do $$
declare r record;
begin
  assert public.admin_report_count() = 1, 'one open report';
  select * into r from public.admin_reports();
  assert r.kind = 'avatar' and r.reported_avatar = 'http://x/y.png', 'admin sees it';
  perform public.admin_resolve_report(r.report_id, true);
  assert public.admin_report_count() = 0, 'closed';
end $$;
reset role;
do $$ begin assert (select avatar_url is null from public.profiles where id = '00000000-0000-0000-0000-00000000010c'), 'picture removed'; end $$;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000010e';

-- Removed courts are remembered; lights can be set by an admin.
do $$ begin
  perform public.admin_set_court_lights('00000000-0000-0000-0000-0000000010cc', true, 21::smallint);
  assert (select lights_until from public.courts where id = '00000000-0000-0000-0000-0000000010cc') = 21, 'lights set';
  assert public.admin_remove_court('00000000-0000-0000-0000-0000000010cd') = 'hidden', 'pin court is hidden';
  assert exists (select 1 from public.removed_spots() where google_place_id = 'place-ten'), 'spot remembered';
  assert public.admin_remove_court('00000000-0000-0000-0000-0000000010cc') in ('deleted','hidden'), 'plain court is removed';
  assert exists (select 1 from public.removed_spots() where lat = 43.82), 'its spot too';
end $$;

reset role;
reset request.jwt.claim.sub;
\echo 'Round 10 tests passed'

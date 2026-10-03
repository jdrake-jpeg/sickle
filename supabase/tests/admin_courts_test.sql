-- Verifies admins can edit and remove courts:
--   * only admins can edit or remove
--   * blank fields are left alone, bad input is rejected
--   * a court with no challenges is deleted; one with history is hidden
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000e1'), ('00000000-0000-0000-0000-0000000000e2'),
  ('00000000-0000-0000-0000-0000000000e3'), ('00000000-0000-0000-0000-0000000000e4');
insert into public.profiles (id, username, display_name, is_admin) values
  ('00000000-0000-0000-0000-0000000000e1', 'editadmin', 'Admin', true),
  ('00000000-0000-0000-0000-0000000000e2', 'editplayer', 'Player', false),
  ('00000000-0000-0000-0000-0000000000e3', 'editp3', 'P3', false),
  ('00000000-0000-0000-0000-0000000000e4', 'editp4', 'P4', false);
insert into public.courts (id, name, lat, lng, address, court_count, indoor, status) values
  ('00000000-0000-0000-0000-00000000ec01', 'Old Name', 1, 1, '1 Main St', 4, false, 'approved'),
  ('00000000-0000-0000-0000-00000000ec02', 'Empty Court', 2, 2, null, null, false, 'approved'),
  ('00000000-0000-0000-0000-00000000ec03', 'Busy Court', 3, 3, null, null, false, 'approved');
insert into public.teams (id, player_low, player_high, created_by) values
  ('00000000-0000-0000-0000-00000000ea01', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-00000000ea02', '00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000e3');
insert into public.challenges (challenger_team_id, challenged_team_id, court_id, proposed_time, created_by) values
  ('00000000-0000-0000-0000-00000000ea01', '00000000-0000-0000-0000-00000000ea02', '00000000-0000-0000-0000-00000000ec03', now(), '00000000-0000-0000-0000-0000000000e1');

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

-- Players can't edit or remove.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e2';
select pg_temp.expect_error($$select public.admin_update_court('00000000-0000-0000-0000-00000000ec01', 'Hacked')$$, 'Only admins can edit');
select pg_temp.expect_error($$select public.admin_remove_court('00000000-0000-0000-0000-00000000ec02')$$, 'Only admins can remove');

-- Admin edits: only the given fields change.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select public.admin_update_court('00000000-0000-0000-0000-00000000ec01', '  Porter Park ', null, 6);
do $$
declare c public.courts;
begin
  select * into c from public.courts where id = '00000000-0000-0000-0000-00000000ec01';
  assert c.name = 'Porter Park' and c.court_count = 6 and c.address = '1 Main St' and not c.indoor and c.lat = 1;
end $$;
select public.admin_update_court('00000000-0000-0000-0000-00000000ec01', p_address => '', p_indoor => true, p_lat => 43.8, p_lng => -111.8);
do $$
declare c public.courts;
begin
  select * into c from public.courts where id = '00000000-0000-0000-0000-00000000ec01';
  assert c.address is null and c.indoor and c.lat = 43.8 and c.lng = -111.8 and c.name = 'Porter Park';
end $$;
select pg_temp.expect_error($$select public.admin_update_court('00000000-0000-0000-0000-00000000ec01', 'x')$$, 'Give the court a name');
select pg_temp.expect_error($$select public.admin_update_court('00000000-0000-0000-0000-00000000ec01', p_court_count => 0)$$, 'Number of courts');
select pg_temp.expect_error($$select public.admin_update_court('00000000-0000-0000-0000-00000000ec01', p_lat => 10)$$, 'Drop a pin');
select pg_temp.expect_error($$select public.admin_update_court(gen_random_uuid(), 'Nowhere')$$, 'Unknown court');

-- Removing: an unused court is deleted, a court with history is hidden.
do $$ begin
  assert public.admin_remove_court('00000000-0000-0000-0000-00000000ec02') = 'deleted';
  assert public.admin_remove_court('00000000-0000-0000-0000-00000000ec03') = 'hidden';
end $$;
reset role;
do $$ begin
  assert not exists (select 1 from public.courts where id = '00000000-0000-0000-0000-00000000ec02');
  assert (select status from public.courts where id = '00000000-0000-0000-0000-00000000ec03') = 'rejected';
end $$;

-- Clean up so later tests see only their own admins.
delete from public.challenges where court_id = '00000000-0000-0000-0000-00000000ec03';
delete from public.teams where id in ('00000000-0000-0000-0000-00000000ea01', '00000000-0000-0000-0000-00000000ea02');
delete from public.courts where id in ('00000000-0000-0000-0000-00000000ec01', '00000000-0000-0000-0000-00000000ec03');
delete from public.profiles where username like 'edit%';
delete from auth.users where id::text like '00000000-0000-0000-0000-0000000000e_';

reset request.jwt.claim.sub;
\echo 'Admin court edit tests passed'

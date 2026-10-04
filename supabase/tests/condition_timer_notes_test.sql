-- Verifies court condition timing and admin court notes:
--   * a condition report shows for 2 hours, then fades
--   * only admins can write a court's permanent note, and it never fades
--   * a blank note clears it
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000ee01'), ('00000000-0000-0000-0000-00000000ee02');
insert into public.profiles (id, username, display_name, is_admin) values
  ('00000000-0000-0000-0000-00000000ee01', 'noteadmin', 'Ada', true),
  ('00000000-0000-0000-0000-00000000ee02', 'noteplayer', 'Pat', false);
insert into public.courts (id, name, lat, lng, status) values
  ('00000000-0000-0000-0000-00000000eecc', 'Note Court', 43.82, -111.78, 'approved');

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

-- A fresh report shows.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ee02';
select public.report_court_condition('00000000-0000-0000-0000-00000000eecc', 'crowded');
do $$ begin
  assert (select count(*) from public.court_conditions('00000000-0000-0000-0000-00000000eecc')) = 1, 'fresh report shows';
end $$;

-- 90 minutes old still shows; 3 hours old is gone.
reset role;
update public.court_condition_reports set created_at = now() - interval '90 minutes'
  where court_id = '00000000-0000-0000-0000-00000000eecc';
set role authenticated;
do $$ begin
  assert (select count(*) from public.court_conditions('00000000-0000-0000-0000-00000000eecc')) = 1, '90 minute old report still shows';
  assert (select count(*) from public.latest_court_conditions() where court_id = '00000000-0000-0000-0000-00000000eecc') = 1;
end $$;
reset role;
update public.court_condition_reports set created_at = now() - interval '3 hours'
  where court_id = '00000000-0000-0000-0000-00000000eecc';
set role authenticated;
do $$ begin
  assert (select count(*) from public.court_conditions('00000000-0000-0000-0000-00000000eecc')) = 0, '3 hour old report is gone';
  assert (select count(*) from public.latest_court_conditions() where court_id = '00000000-0000-0000-0000-00000000eecc') = 0;
end $$;

-- A regular player can't write the note.
select pg_temp.expect_error($$select public.admin_set_court_note('00000000-0000-0000-0000-00000000eecc', 'Hi')$$, 'Only admins');

-- An admin can, and it stays.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ee01';
select public.admin_set_court_note('00000000-0000-0000-0000-00000000eecc', '  Park on the north side.  ');
select pg_temp.expect_error($$select public.admin_set_court_note('00000000-0000-0000-0000-00000000eecc', repeat('x', 301))$$, 'Keep the note');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ee02';
do $$ begin
  assert (select admin_note from public.courts where id = '00000000-0000-0000-0000-00000000eecc') = 'Park on the north side.', 'note is trimmed and visible to players';
end $$;

-- A blank note clears it.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ee01';
select public.admin_set_court_note('00000000-0000-0000-0000-00000000eecc', '   ');
do $$ begin
  assert (select admin_note from public.courts where id = '00000000-0000-0000-0000-00000000eecc') is null, 'blank clears the note';
end $$;

reset role;
reset request.jwt.claim.sub;

-- Clean up so later tests see only their own admins.
delete from public.courts where id = '00000000-0000-0000-0000-00000000eecc';
delete from public.profiles where id in ('00000000-0000-0000-0000-00000000ee01', '00000000-0000-0000-0000-00000000ee02');
delete from auth.users where id in ('00000000-0000-0000-0000-00000000ee01', '00000000-0000-0000-0000-00000000ee02');

\echo 'Condition timer and notes tests passed'

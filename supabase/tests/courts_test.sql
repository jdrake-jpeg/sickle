-- Verifies court sign-up and admin approval:
--   * anyone signed in can submit a court; it starts pending
--   * pending courts are hidden from everyone but the submitter and admins
--   * only admins can approve or reject, and players can't make themselves admin
--   * duplicates and bad input are rejected
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000f1'), ('00000000-0000-0000-0000-0000000000f2'),
  ('00000000-0000-0000-0000-0000000000f3');
insert into public.profiles (id, username, display_name, is_admin) values
  ('00000000-0000-0000-0000-0000000000f1', 'courtadmin', 'Admin', true),
  ('00000000-0000-0000-0000-0000000000f2', 'submitter', 'Sub', false),
  ('00000000-0000-0000-0000-0000000000f3', 'otherguy', 'Other', false);

create temp table court_ids (k text primary key, v uuid);
grant all on court_ids to authenticated;
create function pg_temp.cid(p_k text) returns uuid language sql as $$ select v from court_ids where k = p_k $$;
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

-- A player can't make themselves admin or add courts directly.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f2';
select pg_temp.expect_error($$update public.profiles set is_admin = true where id = auth.uid()$$, 'permission denied');
select pg_temp.expect_error($$insert into public.courts (name, lat, lng, status) values ('Sneaky', 40, -100, 'approved')$$, 'new row violates row-level security');
do $$ begin assert not public.is_admin(); end $$;

-- Submitting: bad input is rejected, a good court is pending.
select pg_temp.expect_error($$select public.submit_court('x', 43.8, -111.8)$$, 'Give the court a name');
select pg_temp.expect_error($$select public.submit_court('Porter Park', null, -111.8)$$, 'Drop a pin');
select pg_temp.expect_error($$select public.submit_court('Porter Park', 43.8, -111.8, null, 0)$$, 'Number of courts');
insert into court_ids select 'porter', public.submit_court('  Porter Park ', 43.8226, -111.7924, '250 W 2nd S', 6, false, 'Lights until 10');
select pg_temp.expect_error($$select public.submit_court('Porter Park again', 43.8227, -111.7925)$$, 'That court is already listed');
do $$ begin
  assert (select status from public.courts where id = pg_temp.cid('porter')) = 'pending';
  assert (select name from public.courts where id = pg_temp.cid('porter')) = 'Porter Park';
end $$;

-- Pending courts are invisible to other players and can't host challenges.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f3';
do $$ begin assert (select count(*) from public.courts where id = pg_temp.cid('porter')) = 0, 'pending court leaked'; end $$;
select pg_temp.expect_error($$select public.review_court(pg_temp.cid('porter'), true)$$, 'Only admins');
select pg_temp.expect_error(
  format($$insert into public.preferred_courts (profile_id, court_id) values (auth.uid(), %L)$$, pg_temp.cid('porter')),
  'new row violates row-level security');

-- The admin sees it, approves it, and everyone can see it.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
do $$ begin assert public.is_admin(); assert (select count(*) from public.courts where status = 'pending') = 1; end $$;
select public.review_court(pg_temp.cid('porter'), true, null, 'Porter Park Pickleball');
select pg_temp.expect_error($$select public.review_court(pg_temp.cid('porter'), false)$$, 'This court was already approved');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f3';
do $$ begin
  assert (select name from public.courts where id = pg_temp.cid('porter')) = 'Porter Park Pickleball';
end $$;
insert into public.preferred_courts (profile_id, court_id) values (auth.uid(), pg_temp.cid('porter'));

-- A rejected court stays hidden, and its spot can be submitted again.
insert into court_ids select 'fake', public.submit_court('Fake Court', 10, 10);
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
select public.review_court(pg_temp.cid('fake'), false, 'Not a real court');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f2';
do $$ begin assert (select count(*) from public.courts where id = pg_temp.cid('fake')) = 0; end $$;
select public.submit_court('Real Court', 10, 10);

-- Five pending submissions is the limit.
select public.submit_court('Spot ' || n, 20 + n, 20) from generate_series(1, 4) n;
select pg_temp.expect_error($$select public.submit_court('Spot 6', 30, 30)$$, 'You have 5 courts waiting');

reset role;
reset request.jwt.claim.sub;
\echo 'Court submission tests passed'

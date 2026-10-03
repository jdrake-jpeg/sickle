-- Verifies Delete my account:
--   * the login and personal rows are gone; the profile is a blank placeholder
--   * open challenges are cancelled; played matches stay for the other team
--   * deleted players can't be found, friended, teamed up with or challenged
--   * the last admin can't delete their account
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000091'), ('00000000-0000-0000-0000-000000000092'),
  ('00000000-0000-0000-0000-000000000093'), ('00000000-0000-0000-0000-000000000094'),
  ('00000000-0000-0000-0000-000000000095');
-- Only admin in this database is delone at first (earlier tests' admins are demoted).
update public.profiles set is_admin = false;
insert into public.profiles (id, username, display_name, is_admin, skill_level) values
  ('00000000-0000-0000-0000-000000000091', 'delone', 'Del One', true, 3.5),
  ('00000000-0000-0000-0000-000000000092', 'deltwo', 'Del Two', false, 3.0),
  ('00000000-0000-0000-0000-000000000093', 'delthree', 'Del Three', false, null),
  ('00000000-0000-0000-0000-000000000094', 'delfour', 'Del Four', false, null),
  ('00000000-0000-0000-0000-000000000095', 'delfive', 'Del Five', false, null);
insert into public.courts (id, name, lat, lng) values ('00000000-0000-0000-0000-000000009c01', 'Del Court', 1, 1);
insert into public.teams (id, player_low, player_high, created_by) values
  ('00000000-0000-0000-0000-000000009a01', '00000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-000000000092'),
  ('00000000-0000-0000-0000-000000009a02', '00000000-0000-0000-0000-000000000093', '00000000-0000-0000-0000-000000000094', '00000000-0000-0000-0000-000000000093');
insert into public.challenges (id, challenger_team_id, challenged_team_id, court_id, proposed_time, created_by, status) values
  ('00000000-0000-0000-0000-000000009b01', '00000000-0000-0000-0000-000000009a01', '00000000-0000-0000-0000-000000009a02', '00000000-0000-0000-0000-000000009c01', now(), '00000000-0000-0000-0000-000000000092', 'pending'),
  ('00000000-0000-0000-0000-000000009b02', '00000000-0000-0000-0000-000000009a02', '00000000-0000-0000-0000-000000009a01', '00000000-0000-0000-0000-000000009c01', now(), '00000000-0000-0000-0000-000000000093', 'completed');
insert into public.matches (id, challenge_id, team_a_id, team_b_id, court_id, played_at, status, winner_team_id, submitted_by, resolved_at) values
  ('00000000-0000-0000-0000-000000009d01', '00000000-0000-0000-0000-000000009b02', '00000000-0000-0000-0000-000000009a02', '00000000-0000-0000-0000-000000009a01', '00000000-0000-0000-0000-000000009c01', now(), 'confirmed', '00000000-0000-0000-0000-000000009a02', '00000000-0000-0000-0000-000000000092', now());
insert into public.player_locations (profile_id, approx_lat, approx_lng) values ('00000000-0000-0000-0000-000000000092', 1, 1);
insert into public.friendships (requester_id, addressee_id, status) values ('00000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-000000000093', 'accepted');
insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-000000000092', '00000000-0000-0000-0000-000000000095');

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

set role anon;
select pg_temp.expect_error($$select public.delete_my_account()$$, 'permission denied');

set role authenticated;

-- The only admin can't delete their account.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000091';
select pg_temp.expect_error($$select public.delete_my_account()$$, 'You are the only admin');

-- Del Two deletes their account.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000092';
select public.delete_my_account();

reset role;
do $$ begin
  assert not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-000000000092'), 'login should be gone';
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-000000000092') = 'Deleted player';
  assert (select username::text from public.profiles where id = '00000000-0000-0000-0000-000000000092') like 'deleted\_%';
  assert (select skill_level from public.profiles where id = '00000000-0000-0000-0000-000000000092') is null;
  assert (select deleted_at from public.profiles where id = '00000000-0000-0000-0000-000000000092') is not null;
  assert not exists (select 1 from public.player_locations where profile_id = '00000000-0000-0000-0000-000000000092'), 'location kept';
  assert not exists (select 1 from public.friendships where '00000000-0000-0000-0000-000000000092' in (requester_id, addressee_id)), 'friendship kept';
  assert not exists (select 1 from public.blocks where blocker_id = '00000000-0000-0000-0000-000000000092'), 'block kept';
  assert (select status from public.challenges where id = '00000000-0000-0000-0000-000000009b01') = 'cancelled', 'open challenge not cancelled';
  assert (select status from public.matches where id = '00000000-0000-0000-0000-000000009d01') = 'confirmed', 'played match should stay';
end $$;

-- Nobody can find, friend, team up with or challenge them now.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000093';
do $$ begin assert (select count(*) from public.search_players('del')) = 3, 'deleted player still in search'; end $$;
select pg_temp.expect_error($$select public.add_friend('00000000-0000-0000-0000-000000000092')$$, 'That player deleted their account');
select pg_temp.expect_error($$select public.create_team('00000000-0000-0000-0000-000000000092')$$, 'That player deleted their account');
reset role;
select pg_temp.expect_error($$insert into public.challenges (challenger_team_id, challenged_team_id, court_id, proposed_time, created_by)
  values ('00000000-0000-0000-0000-000000009a02', '00000000-0000-0000-0000-000000009a01', '00000000-0000-0000-0000-000000009c01', now(), '00000000-0000-0000-0000-000000000093')$$,
  'That player deleted their account');

-- Once there's another admin, the first admin can delete their account.
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-000000000093';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000091';
select public.delete_my_account();
reset role;
do $$ begin
  assert (select is_admin from public.profiles where id = '00000000-0000-0000-0000-000000000091') = false;
end $$;
reset request.jwt.claim.sub;
\echo 'Delete account tests passed'

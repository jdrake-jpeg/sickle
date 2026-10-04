-- Verifies the username check used by the sign up screen:
--   * a taken username comes back as not available, however it is typed
--   * an unused username comes back as available
--   * your own current username counts as available to you
--   * signed out players can't use it
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000ff01'), ('00000000-0000-0000-0000-00000000ff02');
insert into public.profiles (id, username, display_name) values
  ('00000000-0000-0000-0000-00000000ff01', 'johndoe', 'John Doe');

set role authenticated;

-- A new player with no profile yet asks about johndoe.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ff02';
do $$ begin
  assert not public.username_available('johndoe'), 'a taken username is not available';
  assert not public.username_available('  JohnDoe '), 'capitals and spaces do not get around it';
  assert public.username_available('janedoe'), 'an unused username is available';
end $$;

-- John asks about his own username.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ff01';
do $$ begin
  assert public.username_available('johndoe'), 'your own username counts as free to you';
  assert public.username_available('janedoe'), 'an unused username is available';
end $$;

-- Signed out players can't ask.
reset role;
set role anon;
do $$ begin
  begin
    perform public.username_available('johndoe');
    raise exception 'anon should not be able to call username_available';
  exception when insufficient_privilege then
    null;
  end;
end $$;

reset role;
reset request.jwt.claim.sub;

-- Clean up so later tests don't see these players.
delete from public.profiles where id in ('00000000-0000-0000-0000-00000000ff01', '00000000-0000-0000-0000-00000000ff02');
delete from auth.users where id in ('00000000-0000-0000-0000-00000000ff01', '00000000-0000-0000-0000-00000000ff02');

\echo 'Username check tests passed'

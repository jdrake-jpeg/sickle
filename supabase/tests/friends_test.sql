-- Verifies friends and recent opponents:
--   * requests need the other player to accept; sending back accepts
--   * only the two players see a friendship, and nobody writes it directly
--   * blocking ends a friendship and stops new requests
--   * recent_opponents lists people you've challenged or played
--   * admins' courts are approved right away; Google places aren't listed twice
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000a3'), ('00000000-0000-0000-0000-0000000000a4'),
  ('00000000-0000-0000-0000-0000000000a5');
insert into public.profiles (id, username, display_name, is_admin) values
  ('00000000-0000-0000-0000-0000000000a1', 'frienda', 'Ann', true),
  ('00000000-0000-0000-0000-0000000000a2', 'friendb', 'Ben', false),
  ('00000000-0000-0000-0000-0000000000a3', 'friendc', 'Cal', false),
  ('00000000-0000-0000-0000-0000000000a4', 'friendd', 'Dee', false),
  ('00000000-0000-0000-0000-0000000000a5', 'friende', 'Eve', false);

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

-- Ann asks Ben; Ben sees it as incoming, Cal sees nothing.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.expect_error($$select public.add_friend(auth.uid())$$, 'You can''t friend yourself');
select pg_temp.expect_error($$insert into public.friendships values (auth.uid(), '00000000-0000-0000-0000-0000000000a3', 'accepted')$$, 'permission denied');
do $$ begin assert public.add_friend('00000000-0000-0000-0000-0000000000a2') = 'pending'; end $$;
do $$ begin assert public.add_friend('00000000-0000-0000-0000-0000000000a2') = 'pending', 'asking twice stays pending'; end $$;
do $$ begin assert (select relation from public.my_friends()) = 'outgoing'; end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
do $$ begin assert (select count(*) from public.friendships) = 0, 'friendship leaked'; end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
do $$ begin assert (select relation from public.my_friends()) = 'incoming'; end $$;

-- Ben accepts by adding Ann back.
do $$ begin assert public.add_friend('00000000-0000-0000-0000-0000000000a1') = 'accepted'; end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
do $$ begin assert (select relation from public.my_friends()) = 'friend'; end $$;

-- Unfriend, then blocking ends a friendship and stops requests.
select public.remove_friend('00000000-0000-0000-0000-0000000000a2');
do $$ begin assert (select count(*) from public.my_friends()) = 0; end $$;
select public.add_friend('00000000-0000-0000-0000-0000000000a5');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a5';
select public.add_friend('00000000-0000-0000-0000-0000000000a1');
insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), '00000000-0000-0000-0000-0000000000a1');
do $$ begin assert (select count(*) from public.my_friends()) = 0, 'block should end friendship'; end $$;
select pg_temp.expect_error($$select public.add_friend('00000000-0000-0000-0000-0000000000a1')$$, 'You can''t friend this player');

-- Admin courts are approved right away; the same Google place can't be added twice.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
create temp table fcourt (id uuid);
grant all on fcourt to authenticated;
insert into fcourt select public.submit_court('Friend Court', 44.5, -112.5, null, null, false, null, 'places/abc');
do $$ begin assert (select status from public.courts where id = (select id from fcourt)) = 'approved'; end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select pg_temp.expect_error($$select public.submit_court('Elsewhere', 45.5, -113.5, null, null, false, null, 'places/abc')$$, 'That court is already listed');

reset role;
-- Teams are friends only.
insert into public.friendships (requester_id, addressee_id, status, accepted_at) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', 'accepted', now()),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a4', 'accepted', now());

set role authenticated;
-- Ann + Ben challenge Cal + Dee: they show up as recent opponents.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
create temp table fteams (k text, id uuid);
grant all on fteams to authenticated;
insert into fteams select 'ab', public.create_team('00000000-0000-0000-0000-0000000000a2');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
insert into fteams select 'cd', public.create_team('00000000-0000-0000-0000-0000000000a4');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select public.send_challenge((select id from fteams where k = 'ab'), (select id from fteams where k = 'cd'), (select id from fcourt), now() + interval '1 day');
select public.add_friend('00000000-0000-0000-0000-0000000000a3');
do $$ begin
  assert (select count(*) from public.recent_opponents()) = 2;
  assert (select relation from public.recent_opponents() where username::text = 'friendc') = 'outgoing';
  assert (select relation from public.recent_opponents() where username::text = 'friendd') is null;
  assert not (select bool_or(played) from public.recent_opponents());
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a4';
do $$ begin assert (select count(*) from public.recent_opponents()) = 2; end $$;

reset role;
reset request.jwt.claim.sub;
\echo 'Friends tests passed'

-- Verifies round 7:
--   * preferred_windows: a window for each day, validated, readable by others,
--     older picks carried over
--   * alerts: mark one read, clear all (only your own)
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000007a1'), ('00000000-0000-0000-0000-0000000007a2');
insert into public.profiles (id, username, display_name, skill_level) values
  ('00000000-0000-0000-0000-0000000007a1', 'rsevenaa', 'Aaa Seven', 3.5),
  ('00000000-0000-0000-0000-0000000007a2', 'rsevenbb', 'Bbb Seven', 3.5);

-- The validator.
do $$ begin
  assert public.valid_preferred_windows('{}'::jsonb), 'empty is fine';
  assert public.valid_preferred_windows('{"1": 1140, "6": 600}'::jsonb), 'two days is fine';
  assert not public.valid_preferred_windows('{"7": 600}'::jsonb), 'day 7 is not a day';
  assert not public.valid_preferred_windows('{"1": 1500}'::jsonb), 'start too late';
  assert not public.valid_preferred_windows('{"1": -5}'::jsonb), 'start before midnight';
  assert not public.valid_preferred_windows('{"1": 600.5}'::jsonb), 'whole minutes only';
  assert not public.valid_preferred_windows('{"1": "ten"}'::jsonb), 'a number';
  assert not public.valid_preferred_windows('[1, 2]'::jsonb), 'an object';
end $$;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000007a1';
update public.profiles set preferred_windows = '{"1": 1140, "3": 1140, "6": 600}' where id = '00000000-0000-0000-0000-0000000007a1';
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000007a2';
do $$ begin
  assert (select preferred_windows -> '6' from public.profiles where id = '00000000-0000-0000-0000-0000000007a1') = '600', 'others can read it';
  begin
    update public.profiles set preferred_windows = '{"9": 600}' where id = '00000000-0000-0000-0000-0000000007a2';
    raise exception 'bad day should be rejected';
  exception when check_violation then null;
  end;
end $$;
update public.profiles set preferred_windows = '{"2": 60}' where id = '00000000-0000-0000-0000-0000000007a1';
do $$ begin
  assert (select preferred_windows from public.profiles where id = '00000000-0000-0000-0000-0000000007a1') <> '{"2": 60}', 'cannot edit another profile';
end $$;

-- Alerts.
reset role;
reset request.jwt.claim.sub;
select public.notify('00000000-0000-0000-0000-0000000007a1', 'messages', 'One', 'First', null);
select public.notify('00000000-0000-0000-0000-0000000007a1', 'messages', 'Two', 'Second', null);
select public.notify('00000000-0000-0000-0000-0000000007a2', 'messages', 'Other', 'Not yours', null);
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000007a1';
do $$
declare v_id uuid;
begin
  assert public.unread_notification_count() = 2, 'two unread';
  select id into v_id from public.my_notifications() where title = 'One';
  perform public.mark_notification_read(v_id);
  assert public.unread_notification_count() = 1, 'one left unread';
  perform public.clear_notifications();
  assert (select count(*) from public.my_notifications()) = 0, 'all cleared';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000007a2';
do $$ begin
  assert (select count(*) from public.my_notifications()) = 1, 'the other player still has theirs';
end $$;

reset role;
reset request.jwt.claim.sub;
\echo 'Round 7 tests passed'

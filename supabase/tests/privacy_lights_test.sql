-- Verifies the record privacy switch and court lights.
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000d1'), ('00000000-0000-0000-0000-0000000000d2');
insert into public.profiles (id, username, display_name) values
  ('00000000-0000-0000-0000-0000000000d1', 'privdan', 'Dan'),
  ('00000000-0000-0000-0000-0000000000d2', 'privela', 'Ela');
insert into public.courts (id, name, lat, lng, status) values
  ('00000000-0000-0000-0000-0000000000dc', 'Lights Court', 31, -101, 'approved');
insert into public.courts (id, name, lat, lng, status, submitted_by) values
  ('00000000-0000-0000-0000-0000000000dd', 'Pending Court', 32, -102, 'pending', '00000000-0000-0000-0000-0000000000d1');

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

-- Records are public by default.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d2';
do $$ begin
  assert (select wins = 0 and losses = 0 and not hidden from public.player_stats('00000000-0000-0000-0000-0000000000d1'));
end $$;

-- Dan hides his record: Ela sees nulls, Dan still sees his own.
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
update public.profiles set show_record = false where id = auth.uid();
do $$ begin assert (select wins = 0 and hidden from public.player_stats(auth.uid())); end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d2';
do $$ begin
  assert (select wins is null and losses is null and hidden from public.player_stats('00000000-0000-0000-0000-0000000000d1'));
end $$;
-- Ela can't change Dan's setting.
update public.profiles set show_record = true where id = '00000000-0000-0000-0000-0000000000d1';
do $$ begin assert (select hidden from public.player_stats('00000000-0000-0000-0000-0000000000d1')); end $$;

-- Lights: anyone on a listed court; only the submitter on a pending one.
select public.set_court_lights('00000000-0000-0000-0000-0000000000dc', true, 22::smallint);
select pg_temp.expect_error($$select public.set_court_lights('00000000-0000-0000-0000-0000000000dd', false)$$, 'Unknown court');
select pg_temp.expect_error($$select public.set_court_lights('00000000-0000-0000-0000-0000000000dc', true, 30::smallint)$$, 'Pick a time');
-- Direct updates match no rows (no update policy on courts).
update public.courts set has_lights = false where id = '00000000-0000-0000-0000-0000000000dc';
do $$ begin
  assert (select has_lights and lights_until = 22 from public.courts where id = '00000000-0000-0000-0000-0000000000dc');
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select public.set_court_lights('00000000-0000-0000-0000-0000000000dd', false, 21::smallint);
do $$ begin
  assert (select has_lights = false and lights_until is null from public.courts where id = '00000000-0000-0000-0000-0000000000dd');
end $$;

reset role;
reset request.jwt.claim.sub;
\echo 'Privacy and lights tests passed'

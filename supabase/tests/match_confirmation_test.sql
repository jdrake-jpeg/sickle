-- Verifies that only the other team can confirm a result, that only
-- confirmed results count, and that impossible scores are rejected.
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c'), ('00000000-0000-0000-0000-00000000000d');
insert into public.profiles (id, username, display_name, skill_level) values
  ('00000000-0000-0000-0000-00000000000a', 'drake', 'Drake', 3.8),
  ('00000000-0000-0000-0000-00000000000b', 'jack', 'Jack', 3.8),
  ('00000000-0000-0000-0000-00000000000c', 'tysor', 'Ty', 3.7),
  ('00000000-0000-0000-0000-00000000000d', 'ryan', 'Ryan', 3.7);
insert into public.courts (id, name, lat, lng) values
  ('00000000-0000-0000-0000-0000000000c1', 'Test Court', 43.82, -111.79);

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;

set role authenticated;

-- Drake creates a team with Jack; Ty creates a team with Ryan.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into ids values ('drake_jack', public.create_team('00000000-0000-0000-0000-00000000000b'));
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
insert into ids values ('ty_ryan', public.create_team('00000000-0000-0000-0000-00000000000d'));

-- Ty submits a 2-1 win.
insert into ids select 'm1', public.submit_match_result(
  (select v from ids where k = 'ty_ryan'), (select v from ids where k = 'drake_jack'),
  '00000000-0000-0000-0000-0000000000c1', now() - interval '1 hour', '[[11,7],[9,11],[11,8]]');

-- Unconfirmed results do not count.
do $$ begin
  assert (select wins from public.team_records where team_id = (select v from ids where k = 'ty_ryan')) = 0,
    'unconfirmed match must not count';
end $$;

-- Ty and Ryan (submitting team) cannot confirm their own result.
do $$ begin
  begin
    perform public.respond_to_match_result((select v from ids where k = 'm1'), 'confirmed');
    raise exception 'FAIL: submitter confirmed own result';
  exception when others then
    assert sqlerrm like 'Only a player on the other team%', sqlerrm;
  end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
do $$ begin
  begin
    perform public.respond_to_match_result((select v from ids where k = 'm1'), 'confirmed');
    raise exception 'FAIL: submitter teammate confirmed result';
  exception when others then
    assert sqlerrm like 'Only a player on the other team%', sqlerrm;
  end;
end $$;

-- Direct writes are blocked; results only change through the functions.
do $$ begin
  begin
    update public.matches set status = 'confirmed' where id = (select v from ids where k = 'm1');
    assert (select status from public.matches where id = (select v from ids where k = 'm1')) = 'submitted',
      'FAIL: direct update changed status';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Jack (other team) confirms; now it counts.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert public.respond_to_match_result((select v from ids where k = 'm1'), 'confirmed') = 'confirmed';
  assert (select wins from public.team_records where team_id = (select v from ids where k = 'ty_ryan')) = 1;
  assert (select losses from public.team_records where team_id = (select v from ids where k = 'drake_jack')) = 1;
end $$;

-- It cannot be confirmed or disputed twice.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  begin
    perform public.respond_to_match_result((select v from ids where k = 'm1'), 'disputed');
    raise exception 'FAIL: responded twice';
  exception when others then
    assert sqlerrm like 'This result was already%', sqlerrm;
  end;
end $$;

-- A disputed result never counts.
insert into ids select 'm2', public.submit_match_result(
  (select v from ids where k = 'drake_jack'), (select v from ids where k = 'ty_ryan'),
  '00000000-0000-0000-0000-0000000000c1', now() - interval '10 minutes', '[[11,2],[11,3]]');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  assert public.respond_to_match_result((select v from ids where k = 'm2'), 'disputed', 'We won game 2') = 'disputed';
  assert (select wins from public.team_records where team_id = (select v from ids where k = 'drake_jack')) = 0;
end $$;

-- Invalid scores are rejected.
do $$
declare bad jsonb;
begin
  foreach bad in array array['[[11,10],[11,5]]', '[[9,7],[11,5]]', '[[11,5],[11,5],[11,5]]', '[[11,5]]', '[[11,5],[5,11]]', '[[14,10],[11,5]]']::jsonb[] loop
    begin
      perform public.submit_match_result(
        (select v from ids where k = 'ty_ryan'), (select v from ids where k = 'drake_jack'),
        '00000000-0000-0000-0000-0000000000c1', now(), bad);
      raise exception 'FAIL: accepted invalid score %', bad;
    exception when others then
      assert sqlerrm not like 'FAIL%', sqlerrm;
    end;
  end loop;
end $$;

-- An outsider cannot submit a result for teams they are not on.
reset role;
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000e');
insert into public.profiles (id, username, display_name) values ('00000000-0000-0000-0000-00000000000e', 'rando', 'Rando');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
do $$ begin
  begin
    perform public.submit_match_result(
      (select v from ids where k = 'ty_ryan'), (select v from ids where k = 'drake_jack'),
      '00000000-0000-0000-0000-0000000000c1', now(), '[[11,5],[11,5]]');
    raise exception 'FAIL: outsider submitted';
  exception when others then
    assert sqlerrm like 'Only a player in this match%', sqlerrm;
  end;
end $$;

\echo 'All match confirmation tests passed'

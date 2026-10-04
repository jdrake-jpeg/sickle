-- Verifies editing and deleting teams, and win history:
--   * rename a team (members only, 40 character limit)
--   * delete a team: blocked while a game is open, cancels pending challenges,
--     hard deletes a team that never played, hides one that did
--   * a deleted team cannot be challenged; making the pairing again revives it
--   * team and player history show confirmed matches from the right point of view
--   * hidden records hide history, except from the player themselves
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000ac01'), ('00000000-0000-0000-0000-00000000ac02'),
  ('00000000-0000-0000-0000-00000000ac03'), ('00000000-0000-0000-0000-00000000ac04'),
  ('00000000-0000-0000-0000-00000000ac05');
insert into public.profiles (id, username, display_name) values
  ('00000000-0000-0000-0000-00000000ac01', 'histone', 'Hist One'),
  ('00000000-0000-0000-0000-00000000ac02', 'histtwo', 'Hist Two'),
  ('00000000-0000-0000-0000-00000000ac03', 'histthree', 'Hist Three'),
  ('00000000-0000-0000-0000-00000000ac04', 'histfour', 'Hist Four'),
  ('00000000-0000-0000-0000-00000000ac05', 'histfive', 'Hist Five');
insert into public.courts (id, name, lat, lng, status) values
  ('00000000-0000-0000-0000-00000000accc', 'History Court', 43.82, -111.79, 'approved');

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

-- Teams: One + Two (ab), Three + Four (cd), One + Five (ae).
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ac01';
insert into ids values ('ab', public.create_team('00000000-0000-0000-0000-00000000ac02'));
insert into ids values ('ae', public.create_team('00000000-0000-0000-0000-00000000ac05'));
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ac03';
insert into ids values ('cd', public.create_team('00000000-0000-0000-0000-00000000ac04'));

-- Renaming.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ac01';
select public.update_team_name(pg_temp.id('ab'), '  The Dinkers ');
do $$ begin
  assert (select team_name from public.my_teams() where team_id = pg_temp.id('ab')) = 'The Dinkers', 'renamed';
end $$;
select public.update_team_name(pg_temp.id('ab'), '');
do $$ begin
  assert (select team_name from public.my_teams() where team_id = pg_temp.id('ab')) = 'Hist One + Hist Two', 'blank name goes back to the players';
end $$;
select pg_temp.expect_error($$select public.update_team_name(pg_temp.id('ab'), repeat('x', 41))$$, 'Keep the team name under 40');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ac03';
select pg_temp.expect_error($$select public.update_team_name(pg_temp.id('ab'), 'Nope')$$, 'You are not on that team');
select pg_temp.expect_error($$select public.delete_team(pg_temp.id('ab'))$$, 'You are not on that team');

-- ab beats cd in one game, confirmed.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ac01';
insert into ids select 'c1', public.send_challenge(pg_temp.id('ab'), pg_temp.id('cd'), '00000000-0000-0000-0000-00000000accc', now() + interval '1 day', 1::smallint);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ac03';
select public.respond_to_challenge(pg_temp.id('c1'), true);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ac01';
insert into ids select 'm1', public.submit_match_result(pg_temp.id('c1'), '[[11,7]]');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ac03';
select public.confirm_match_result(pg_temp.id('m1'));

-- History from each side. Scores read from the team's own point of view.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ac01';
do $$ begin
  assert (select count(*) from public.team_history(pg_temp.id('ab'))) = 1, 'ab has one match';
  assert (select won from public.team_history(pg_temp.id('ab'))), 'ab won';
  assert (select games from public.team_history(pg_temp.id('ab'))) = '[[11,7]]'::jsonb, 'ab score';
  assert (select court_name from public.team_history(pg_temp.id('ab'))) = 'History Court', 'court name';
  assert (select opponent_name from public.team_history(pg_temp.id('ab'))) = 'Hist Three + Hist Four', 'opponent name';
  -- Another team's history is public while records are shown.
  assert (select not won from public.team_history(pg_temp.id('cd'))), 'cd lost';
  assert (select games from public.team_history(pg_temp.id('cd'))) = '[[7,11]]'::jsonb, 'cd score is flipped';
  assert (select count(*) from public.player_history('00000000-0000-0000-0000-00000000ac04')) = 1, 'player history of someone else';
  assert (select with_name from public.player_history('00000000-0000-0000-0000-00000000ac04')) = 'Hist Three', 'played with';
  assert (select opponent_name from public.player_history('00000000-0000-0000-0000-00000000ac04')) = 'Hist One + Hist Two', 'played against';
  assert (select not won from public.player_history('00000000-0000-0000-0000-00000000ac04')), 'lost';
  assert (select wins from public.team_detail(pg_temp.id('cd'))) = 0 and (select losses from public.team_detail(pg_temp.id('cd'))) = 1, 'detail record';
  assert (select not is_member from public.team_detail(pg_temp.id('cd'))), 'not a member of cd';
  assert (select jsonb_array_length(members) from public.team_detail(pg_temp.id('cd'))) = 2, 'two members';
end $$;

-- A hidden record hides history too, but not from the player.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ac04';
update public.profiles set show_record = false where id = '00000000-0000-0000-0000-00000000ac04';
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ac01';
do $$ begin
  assert (select count(*) from public.player_history('00000000-0000-0000-0000-00000000ac04')) = 0, 'hidden player history';
  assert (select count(*) from public.team_history(pg_temp.id('cd'))) = 0, 'hidden team history';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ac04';
do $$ begin
  assert (select count(*) from public.player_history('00000000-0000-0000-0000-00000000ac04')) = 1, 'own history still shows';
  assert (select count(*) from public.team_history(pg_temp.id('cd'))) = 1, 'own team history still shows';
end $$;
update public.profiles set show_record = true where id = '00000000-0000-0000-0000-00000000ac04';

-- Deleting: an open (accepted, unscored) game blocks it.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ac01';
insert into ids select 'c2', public.send_challenge(pg_temp.id('ab'), pg_temp.id('cd'), '00000000-0000-0000-0000-00000000accc', now() + interval '2 days');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ac03';
select public.respond_to_challenge(pg_temp.id('c2'), true);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ac01';
select pg_temp.expect_error($$select public.delete_team(pg_temp.id('ab'))$$, 'Finish or call off your games');
select public.cancel_challenge(pg_temp.id('c2'));

-- A team that never played is removed completely.
do $$ begin assert (select count(*) from public.my_teams()) = 2, 'two teams before'; end $$;
select public.delete_team(pg_temp.id('ae'));
do $$ begin
  assert (select count(*) from public.my_teams()) = 1, 'one team after';
end $$;
reset role;
do $$ begin assert not exists (select 1 from public.teams where id = pg_temp.id('ae')), 'never played team is gone'; end $$;
set role authenticated;

-- A pending challenge is cancelled, and the team that has played is hidden, not erased.
insert into ids values ('ae2', public.create_team('00000000-0000-0000-0000-00000000ac05'));
insert into ids select 'c3', public.send_challenge(pg_temp.id('ae2'), pg_temp.id('cd'), '00000000-0000-0000-0000-00000000accc', now() + interval '3 days');
select public.delete_team(pg_temp.id('ae2'));
reset role;
do $$ begin
  assert (select status from public.challenges where id = pg_temp.id('c3')) = 'cancelled', 'pending challenge cancelled';
  assert (select deleted_at is not null from public.teams where id = pg_temp.id('ae2')), 'soft deleted';
end $$;
set role authenticated;
do $$ begin assert (select count(*) from public.my_teams()) = 1, 'deleted team is hidden'; end $$;

-- A deleted team cannot be challenged, and its history is still there for its players.
select public.delete_team(pg_temp.id('ab'));
do $$ begin
  assert (select count(*) from public.my_teams()) = 0, 'no teams left';
  assert (select count(*) from public.team_history(pg_temp.id('ab'))) = 1, 'history survives delete';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ac03';
do $$ begin assert (select count(*) from public.player_teams('00000000-0000-0000-0000-00000000ac01')) = 0, 'hidden from others'; end $$;
select pg_temp.expect_error(
  $$select public.send_challenge(pg_temp.id('cd'), pg_temp.id('ab'), '00000000-0000-0000-0000-00000000accc', now() + interval '1 day')$$,
  'That team is not active anymore');

-- Making the pairing again brings the same team back.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000ac01';
do $$ begin
  assert public.create_team('00000000-0000-0000-0000-00000000ac02', 'Back Again') = pg_temp.id('ab'), 'same team id';
  assert (select team_name from public.my_teams()) = 'Back Again', 'revived with the new name';
  assert (select wins from public.my_teams()) = 1, 'record kept';
end $$;

reset role;
reset request.jwt.claim.sub;
\echo 'Team edit and history tests passed'

-- Singles. Every player gets a built in one person "singles team", so
-- challenges, scores, records and leaderboards work the same way as doubles.
-- Singles and doubles never mix: a singles team only plays singles teams, and
-- court leaderboards are kept separately for each.
--
-- Additive. Older app builds only know doubles: my_teams() still lists doubles
-- teams only, and court_leaderboard(uuid) still returns the doubles board.

alter table public.teams alter column player_high drop not null;
-- (player_low < player_high already passes when player_high is null)
create unique index teams_one_singles_per_player on public.teams (player_low) where player_high is null;

-- A singles team shows as the player's name.
create or replace function public.team_display_name(p_team uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(t.name, case when t.player_high is null then a.display_name else a.display_name || ' + ' || b.display_name end)
  from public.teams t
  join public.profiles a on a.id = t.player_low
  left join public.profiles b on b.id = t.player_high
  where t.id = p_team;
$$;

-- Everyone in a match. (Leaves out the empty slot of a singles team; a null in
-- the list would also make "not in" checks quietly pass.)
create or replace function public.match_players(p_match uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select x
  from public.matches m
  join public.teams a on a.id = m.team_a_id
  join public.teams b on b.id = m.team_b_id
  cross join lateral unnest(array[a.player_low, a.player_high, b.player_low, b.player_high]) as x
  where m.id = p_match and x is not null;
$$;

-- Everyone has a singles team: new profiles get one, existing ones now.
create function public.make_singles_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.teams (player_low, player_high, created_by)
  values (new.id, null, new.id)
  on conflict do nothing;
  return new;
end;
$$;

create trigger profiles_make_singles_team
after insert on public.profiles
for each row execute function public.make_singles_team();

insert into public.teams (player_low, player_high, created_by)
select p.id, null, p.id
from public.profiles p
where p.deleted_at is null
on conflict do nothing;

-- Challenges: doubles teams play doubles teams, singles play singles.
drop function public.send_challenge(uuid, uuid, uuid, timestamptz, smallint);
create function public.send_challenge(
  p_my_team uuid, p_their_team uuid, p_court uuid, p_time timestamptz, p_best_of smallint default 3
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_mine public.teams;
  v_theirs public.teams;
  v_id uuid;
begin
  if not public.is_team_member(p_my_team, v_me) then raise exception 'You are not on that team'; end if;
  if p_best_of is null or p_best_of not in (1, 3) then raise exception 'Pick one game or best of 3'; end if;
  select * into v_mine from public.teams where id = p_my_team;
  select * into v_theirs from public.teams where id = p_their_team;
  if v_theirs.id is null then raise exception 'Unknown team'; end if;
  if (v_mine.player_high is null) <> (v_theirs.player_high is null) then
    raise exception 'Singles teams play singles and doubles teams play doubles';
  end if;
  if v_mine.player_low in (v_theirs.player_low, v_theirs.player_high)
     or v_mine.player_high in (v_theirs.player_low, v_theirs.player_high) then
    raise exception 'A player cannot be on both teams';
  end if;
  if public.teams_blocked(p_my_team, p_their_team) then raise exception 'You cannot challenge this team'; end if;
  if not exists (select 1 from public.courts where id = p_court and status = 'approved') then
    raise exception 'Pick an approved court';
  end if;
  if p_time < now() then raise exception 'Pick a time in the future'; end if;

  insert into public.challenges (challenger_team_id, challenged_team_id, court_id, proposed_time, created_by, best_of)
  values (p_my_team, p_their_team, p_court, p_time, v_me, p_best_of)
  returning id into v_id;
  return v_id;
end;
$$;

-- Court leaderboards, one for doubles and one for singles (Elo, as before).
create function public.court_leaderboard(p_court uuid, p_singles boolean)
returns table (rank bigint, team_id uuid, team_name text, rating integer, wins integer, losses integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ratings jsonb := '{}'::jsonb;
  v_wins jsonb := '{}'::jsonb;
  v_losses jsonb := '{}'::jsonb;
  m record;
  v_loser uuid;
  v_rw numeric;
  v_rl numeric;
  v_expected numeric;
begin
  for m in
    select mm.winner_team_id, case when mm.winner_team_id = mm.team_a_id then mm.team_b_id else mm.team_a_id end as loser
    from public.matches mm
    join public.teams ta on ta.id = mm.team_a_id
    where mm.court_id = p_court and mm.status = 'confirmed'
      and (ta.player_high is null) = coalesce(p_singles, false)
    order by mm.resolved_at, mm.id
  loop
    v_loser := m.loser;
    v_rw := coalesce((v_ratings ->> m.winner_team_id::text)::numeric, 1000);
    v_rl := coalesce((v_ratings ->> v_loser::text)::numeric, 1000);
    v_expected := 1 / (1 + power(10, (v_rl - v_rw) / 400));
    v_ratings := v_ratings
      || jsonb_build_object(m.winner_team_id::text, v_rw + 32 * (1 - v_expected))
      || jsonb_build_object(v_loser::text, v_rl - 32 * (1 - v_expected));
    v_wins := v_wins || jsonb_build_object(m.winner_team_id::text, coalesce((v_wins ->> m.winner_team_id::text)::int, 0) + 1);
    v_losses := v_losses || jsonb_build_object(v_loser::text, coalesce((v_losses ->> v_loser::text)::int, 0) + 1);
  end loop;

  return query
  select row_number() over (order by r.value::numeric desc, coalesce((v_wins ->> r.key)::int, 0) desc, r.key),
         r.key::uuid,
         public.team_display_name(r.key::uuid),
         round(r.value::numeric)::int,
         coalesce((v_wins ->> r.key)::int, 0),
         coalesce((v_losses ->> r.key)::int, 0)
  from jsonb_each_text(v_ratings) r
  order by 1;
end;
$$;

-- The old one argument version stays, and means doubles.
create or replace function public.court_leaderboard(p_court uuid)
returns table (rank bigint, team_id uuid, team_name text, rating integer, wins integer, losses integer)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.court_leaderboard(p_court, false);
$$;

-- Older builds only know doubles: their lists skip singles teams.
create or replace function public.player_teams(p_profile uuid)
returns table (team_id uuid, team_name text, wins bigint, losses bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, public.team_display_name(t.id), coalesce(r.wins, 0), coalesce(r.losses, 0)
  from public.teams t
  left join public.team_records r on r.team_id = t.id
  where p_profile in (t.player_low, t.player_high)
    and t.player_high is not null
    and t.deleted_at is null
    and not public.players_blocked(auth.uid(), t.player_low)
    and not public.players_blocked(auth.uid(), t.player_high)
  order by t.created_at;
$$;

-- Your teams with singles included (the singles team has no partner).
create function public.my_teams_all()
returns table (team_id uuid, team_name text, partner_id uuid, partner_name text, wins bigint, losses bigint, is_singles boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, public.team_display_name(t.id),
         p.id, p.display_name,
         coalesce(r.wins, 0), coalesce(r.losses, 0),
         t.player_high is null
  from public.teams t
  left join public.profiles p on p.id = case when t.player_low = auth.uid() then t.player_high else t.player_low end
  left join public.team_records r on r.team_id = t.id
  where auth.uid() in (t.player_low, t.player_high)
    and t.deleted_at is null
  order by (t.player_high is null) desc, t.created_at;
$$;

-- Another player's teams with singles included.
create function public.player_teams_all(p_profile uuid)
returns table (team_id uuid, team_name text, wins bigint, losses bigint, is_singles boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, public.team_display_name(t.id), coalesce(r.wins, 0), coalesce(r.losses, 0), t.player_high is null
  from public.teams t
  left join public.team_records r on r.team_id = t.id
  where p_profile in (t.player_low, t.player_high)
    and t.deleted_at is null
    and not public.players_blocked(auth.uid(), p_profile)
    and (t.player_high is null or not public.players_blocked(auth.uid(), t.player_high))
    and not public.players_blocked(auth.uid(), t.player_low)
  order by (t.player_high is null) desc, t.created_at;
$$;

revoke execute on function
  public.make_singles_team(),
  public.send_challenge(uuid, uuid, uuid, timestamptz, smallint),
  public.court_leaderboard(uuid, boolean),
  public.court_leaderboard(uuid),
  public.my_teams_all(),
  public.player_teams_all(uuid),
  public.match_players(uuid),
  public.team_display_name(uuid)
from public, anon, authenticated;
grant execute on function
  public.send_challenge(uuid, uuid, uuid, timestamptz, smallint),
  public.court_leaderboard(uuid, boolean),
  public.court_leaderboard(uuid),
  public.my_teams_all(),
  public.player_teams_all(uuid),
  public.team_display_name(uuid)
to authenticated;

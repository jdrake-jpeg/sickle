-- Edit and delete teams, and see win history for a team or a player.
-- Additive: older app builds keep working (my_teams and player_teams keep the
-- same columns, they just stop listing deleted teams).

-- ---------------------------------------------------------------------------
-- Deleting a team
-- ---------------------------------------------------------------------------
-- A team that has played keeps its rows, because match history points at it.
-- Deleting it hides it everywhere (your teams, challenges) but past matches
-- still show in history. Making the same pairing again brings it back.

alter table public.teams add column deleted_at timestamptz;

create or replace function public.create_team(p_partner uuid, p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_team uuid;
begin
  if v_me is null then raise exception 'Not signed in'; end if;
  if p_partner = v_me then raise exception 'A team needs two different players'; end if;
  if exists (
    select 1 from public.blocks
    where (blocker_id = v_me and blocked_id = p_partner) or (blocker_id = p_partner and blocked_id = v_me)
  ) then
    raise exception 'You cannot team up with this player';
  end if;

  insert into public.teams (player_low, player_high, name, created_by)
  values (least(v_me, p_partner), greatest(v_me, p_partner), nullif(trim(p_name), ''), v_me)
  on conflict (player_low, player_high) do update
    set name = case when public.teams.deleted_at is not null then excluded.name else coalesce(excluded.name, public.teams.name) end,
        deleted_at = null
  returning id into v_team;

  return v_team;
end;
$$;

-- Same columns as before, minus deleted teams.
create or replace function public.my_teams()
returns table (team_id uuid, team_name text, partner_id uuid, partner_name text, wins bigint, losses bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, public.team_display_name(t.id),
         p.id, p.display_name,
         coalesce(r.wins, 0), coalesce(r.losses, 0)
  from public.teams t
  join public.profiles p on p.id = case when t.player_low = auth.uid() then t.player_high else t.player_low end
  left join public.team_records r on r.team_id = t.id
  where auth.uid() in (t.player_low, t.player_high)
    and t.deleted_at is null
  order by t.created_at;
$$;

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
    and t.deleted_at is null
    and not public.players_blocked(auth.uid(), t.player_low)
    and not public.players_blocked(auth.uid(), t.player_high)
  order by t.created_at;
$$;

-- Nobody can challenge, or be challenged as, a deleted team.
create function public.challenges_no_deleted_teams()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.teams t
    where t.id in (new.challenger_team_id, new.challenged_team_id) and t.deleted_at is not null
  ) then
    raise exception 'That team is not active anymore';
  end if;
  return new;
end;
$$;

create trigger challenges_no_deleted_teams
before insert on public.challenges
for each row execute function public.challenges_no_deleted_teams();

create function public.update_team_name(p_team uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(trim(coalesce(p_name, '')), '');
begin
  if not public.is_team_member(p_team, auth.uid()) then raise exception 'You are not on that team'; end if;
  if v_name is not null and char_length(v_name) > 40 then raise exception 'Keep the team name under 40 characters'; end if;
  update public.teams set name = v_name where id = p_team and deleted_at is null;
  if not found then raise exception 'That team is not active anymore'; end if;
end;
$$;

-- Either player can delete the team. Games still waiting on a score, or a
-- confirmation, have to be finished or called off first. Pending challenges
-- are cancelled. A team that never played is removed completely.
create function public.delete_team(p_team uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_team_member(p_team, auth.uid()) then raise exception 'You are not on that team'; end if;
  if not exists (select 1 from public.teams where id = p_team and deleted_at is null) then
    raise exception 'That team is not active anymore';
  end if;

  if exists (
    select 1 from public.challenges c
    where p_team in (c.challenger_team_id, c.challenged_team_id)
      and c.status = 'accepted'
      and not exists (select 1 from public.matches m where m.challenge_id = c.id and m.status in ('confirmed', 'voided', 'unconfirmed'))
  ) then
    raise exception 'Finish or call off your games with this team first';
  end if;

  update public.challenges
  set status = 'cancelled', updated_at = now()
  where p_team in (challenger_team_id, challenged_team_id) and status = 'pending';

  if exists (select 1 from public.challenges c where p_team in (c.challenger_team_id, c.challenged_team_id))
     or exists (select 1 from public.matches m where p_team in (m.team_a_id, m.team_b_id)) then
    update public.teams set deleted_at = now() where id = p_team;
  else
    delete from public.teams where id = p_team;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Win history
-- ---------------------------------------------------------------------------
-- Confirmed matches only. Scores are written from the point of view of the
-- team (or player) you are looking at: [their score, opponent score].
-- Players who hide their record (show_record) hide history too, except from
-- themselves, and blocked pairs see nothing.

create function public.team_detail(p_team uuid)
returns table (team_id uuid, team_name text, custom_name text, is_member boolean, wins bigint, losses bigint, members jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id,
         public.team_display_name(t.id),
         t.name,
         auth.uid() in (t.player_low, t.player_high),
         coalesce(r.wins, 0),
         coalesce(r.losses, 0),
         (select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'username', p.username) order by p.display_name)
          from public.profiles p where p.id in (t.player_low, t.player_high))
  from public.teams t
  left join public.team_records r on r.team_id = t.id
  where t.id = p_team
    and (t.deleted_at is null or auth.uid() in (t.player_low, t.player_high))
    and (
      auth.uid() in (t.player_low, t.player_high)
      or (not public.players_blocked(auth.uid(), t.player_low) and not public.players_blocked(auth.uid(), t.player_high))
    );
$$;

create function public.team_history(p_team uuid)
returns table (
  challenge_id uuid, played_at timestamptz, court_id uuid, court_name text,
  opponent_id uuid, opponent_name text, won boolean, games jsonb, best_of smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.challenge_id, m.played_at, m.court_id, co.name,
         opp.id, public.team_display_name(opp.id),
         m.winner_team_id = p_team,
         (select jsonb_agg(
                   case when m.team_a_id = p_team
                        then jsonb_build_array(g.team_a_score, g.team_b_score)
                        else jsonb_build_array(g.team_b_score, g.team_a_score) end
                   order by g.game_number)
          from public.games g where g.match_id = m.id),
         c.best_of
  from public.teams t
  join public.matches m on m.status = 'confirmed' and t.id in (m.team_a_id, m.team_b_id)
  join public.teams opp on opp.id = case when m.team_a_id = t.id then m.team_b_id else m.team_a_id end
  join public.challenges c on c.id = m.challenge_id
  join public.courts co on co.id = m.court_id
  where t.id = p_team
    and (
      auth.uid() in (t.player_low, t.player_high)
      or (
        not public.players_blocked(auth.uid(), t.player_low)
        and not public.players_blocked(auth.uid(), t.player_high)
        and not exists (
          select 1 from public.profiles p
          where p.id in (t.player_low, t.player_high) and not p.show_record
        )
      )
    )
  order by m.played_at desc;
$$;

create function public.player_history(p_profile uuid)
returns table (
  challenge_id uuid, played_at timestamptz, court_id uuid, court_name text,
  team_id uuid, team_name text, with_id uuid, with_name text,
  opponent_id uuid, opponent_name text, won boolean, games jsonb, best_of smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.challenge_id, m.played_at, m.court_id, co.name,
         t.id, public.team_display_name(t.id),
         mate.id, mate.display_name,
         opp.id, public.team_display_name(opp.id),
         m.winner_team_id = t.id,
         (select jsonb_agg(
                   case when m.team_a_id = t.id
                        then jsonb_build_array(g.team_a_score, g.team_b_score)
                        else jsonb_build_array(g.team_b_score, g.team_a_score) end
                   order by g.game_number)
          from public.games g where g.match_id = m.id),
         c.best_of
  from public.profiles p
  join public.teams t on p.id in (t.player_low, t.player_high)
  join public.matches m on m.status = 'confirmed' and t.id in (m.team_a_id, m.team_b_id)
  join public.teams opp on opp.id = case when m.team_a_id = t.id then m.team_b_id else m.team_a_id end
  join public.challenges c on c.id = m.challenge_id
  join public.courts co on co.id = m.court_id
  join public.profiles mate on mate.id = case when t.player_low = p.id then t.player_high else t.player_low end
  where p.id = p_profile
    and (p.show_record or p.id = auth.uid())
    and not public.players_blocked(auth.uid(), p.id)
  order by m.played_at desc;
$$;

revoke execute on function
  public.create_team(uuid, text),
  public.my_teams(),
  public.player_teams(uuid),
  public.challenges_no_deleted_teams(),
  public.update_team_name(uuid, text),
  public.delete_team(uuid),
  public.team_detail(uuid),
  public.team_history(uuid),
  public.player_history(uuid)
from public, anon, authenticated;
grant execute on function
  public.create_team(uuid, text),
  public.my_teams(),
  public.player_teams(uuid),
  public.update_team_name(uuid, text),
  public.delete_team(uuid),
  public.team_detail(uuid),
  public.team_history(uuid),
  public.player_history(uuid)
to authenticated;

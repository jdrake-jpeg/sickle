-- Round 3: one team per pair of players, and names and usernames are permanent.
-- Additive: older builds keep working. An older build that tries to change a
-- name gets a permission error instead.

-- ---------------------------------------------------------------------------
-- No second team with the same person (a deleted team can still be remade)
-- ---------------------------------------------------------------------------

create or replace function public.create_team(p_partner uuid, p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_team uuid;
  v_first text;
begin
  if v_me is null then raise exception 'Not signed in'; end if;
  if p_partner = v_me then raise exception 'A team needs two different players'; end if;
  if exists (
    select 1 from public.blocks
    where (blocker_id = v_me and blocked_id = p_partner) or (blocker_id = p_partner and blocked_id = v_me)
  ) then
    raise exception 'You cannot team up with this player';
  end if;
  if exists (select 1 from public.profiles where id = p_partner and deleted_at is not null) then
    raise exception 'That player deleted their account';
  end if;
  if not public.are_friends(v_me, p_partner) then
    raise exception 'You can only make a team with a friend. Add them as a friend first';
  end if;

  if exists (
    select 1 from public.teams
    where player_low = least(v_me, p_partner) and player_high = greatest(v_me, p_partner) and deleted_at is null
  ) then
    select split_part(display_name, ' ', 1) into v_first from public.profiles where id = p_partner;
    raise exception 'You already have a team with %', coalesce(v_first, 'that player');
  end if;

  insert into public.teams (player_low, player_high, name, created_by)
  values (least(v_me, p_partner), greatest(v_me, p_partner), nullif(trim(p_name), ''), v_me)
  on conflict (player_low, player_high) do update
    set name = excluded.name,
        deleted_at = null
  returning id into v_team;

  return v_team;
end;
$$;

revoke all on function public.create_team(uuid, text) from public, anon;
grant execute on function public.create_team(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Usernames and names can't be changed after they're set
-- ---------------------------------------------------------------------------

revoke update (username, display_name) on public.profiles from authenticated;

-- ---------------------------------------------------------------------------
-- Find people: browse players by skill group and singles or doubles. Not your
-- friends yet, not blocked, anyone looking to play first, then closest to your level.
-- ---------------------------------------------------------------------------

create function public.browse_players(
  p_min_skill numeric default null,
  p_max_skill numeric default null,
  p_format text default null
)
returns table (
  profile_id uuid, display_name text, username citext, skill_level numeric,
  looking_now boolean, plays_singles boolean, plays_doubles boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.username, p.skill_level,
         p.availability = 'looking_to_play' and p.availability_expires_at > now(),
         p.plays_singles, p.plays_doubles
  from public.profiles p
  left join public.profiles me on me.id = auth.uid()
  where auth.uid() is not null
    and p.id <> auth.uid()
    and p.deleted_at is null
    and (p_min_skill is null or p.skill_level >= p_min_skill)
    and (p_max_skill is null or p.skill_level <= p_max_skill)
    and (p_format is null or (p_format = 'singles' and p.plays_singles) or (p_format = 'doubles' and p.plays_doubles))
    and not public.players_blocked(auth.uid(), p.id)
    and not public.are_friends(auth.uid(), p.id)
  order by (p.availability = 'looking_to_play' and p.availability_expires_at > now()) desc,
           abs(coalesce(p.skill_level, 0) - coalesce(me.skill_level, 0)),
           p.display_name
  limit 60;
$$;

revoke all on function public.browse_players(numeric, numeric, text) from public, anon;
grant execute on function public.browse_players(numeric, numeric, text) to authenticated;

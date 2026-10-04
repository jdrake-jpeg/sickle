-- Who you play, who can challenge you, and court champion crowns.
-- Additive: older builds keep working (new columns have defaults, nearby_players
-- keeps working with its old arguments).

-- ---------------------------------------------------------------------------
-- Settings: open to singles and doubles, who can challenge or friend you
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column plays_singles boolean not null default true,
  add column plays_doubles boolean not null default true,
  -- Who can send you challenges: everyone, only friends, or nobody (paused).
  add column challenges_from text not null default 'everyone' check (challenges_from in ('everyone', 'friends', 'nobody')),
  add column friend_requests boolean not null default true;

grant update (plays_singles, plays_doubles, challenges_from, friend_requests) on public.profiles to authenticated;

create function public.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = p_a and f.addressee_id = p_b) or (f.requester_id = p_b and f.addressee_id = p_a))
  );
$$;

-- A challenge respects the settings of everyone on the team it is sent to.
create function public.challenges_check_open()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
begin
  for p in
    select pr.id, pr.display_name, pr.challenges_from
    from public.teams t
    join public.profiles pr on pr.id in (t.player_low, t.player_high)
    where t.id = new.challenged_team_id and pr.id <> new.created_by
  loop
    if p.challenges_from = 'nobody' then
      raise exception '% isn''t taking challenges right now', split_part(p.display_name, ' ', 1);
    end if;
    if p.challenges_from = 'friends' and not public.are_friends(new.created_by, p.id) then
      raise exception '% only takes challenges from friends', split_part(p.display_name, ' ', 1);
    end if;
  end loop;
  return new;
end;
$$;

create trigger challenges_check_open
before insert on public.challenges
for each row execute function public.challenges_check_open();

-- A new friend request respects "friend requests" (accepting one you already
-- got is an update, so it is never blocked).
create function public.friendships_check_open()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.profiles where id = new.addressee_id and not friend_requests) then
    raise exception 'This player isn''t taking friend requests right now';
  end if;
  return new;
end;
$$;

create trigger friendships_check_open
before insert on public.friendships
for each row execute function public.friendships_check_open();

-- What you can do with another player right now.
create function public.player_open(p_profile uuid)
returns table (can_challenge boolean, challenge_note text, can_friend boolean, plays_singles boolean, plays_doubles boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.challenges_from = 'everyone' or (p.challenges_from = 'friends' and public.are_friends(auth.uid(), p.id)),
         case p.challenges_from
           when 'nobody' then split_part(p.display_name, ' ', 1) || ' isn''t taking challenges right now'
           when 'friends' then case when public.are_friends(auth.uid(), p.id) then null
                                    else split_part(p.display_name, ' ', 1) || ' only takes challenges from friends' end
         end,
         p.friend_requests or public.are_friends(auth.uid(), p.id),
         p.plays_singles,
         p.plays_doubles
  from public.profiles p
  where p.id = p_profile and p.deleted_at is null and not public.players_blocked(auth.uid(), p.id);
$$;

-- ---------------------------------------------------------------------------
-- Finding players: by format, and people near your level
-- ---------------------------------------------------------------------------

-- Same as before, plus open to singles or doubles, and an optional filter:
-- p_format 'singles' or 'doubles'.
drop function public.nearby_players(double precision, double precision, double precision, numeric, numeric);
create function public.nearby_players(
  p_lat double precision,
  p_lng double precision,
  p_radius_miles double precision default 5,
  p_min_skill numeric default null,
  p_max_skill numeric default null,
  p_format text default null
)
returns table (
  profile_id uuid,
  display_name text,
  username citext,
  avatar_url text,
  skill_level numeric,
  looking_until timestamptz,
  distance_miles double precision,
  plays_singles boolean,
  plays_doubles boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.username, p.avatar_url, p.skill_level, p.availability_expires_at,
         greatest(0.5, round((public.distance_miles(p_lat, p_lng, l.approx_lat, l.approx_lng) * 2)::numeric) / 2)::double precision,
         p.plays_singles, p.plays_doubles
  from public.profiles p
  join public.player_locations l on l.profile_id = p.id
  where p.id <> auth.uid()
    and p.deleted_at is null
    and p.availability = 'looking_to_play'
    and p.availability_expires_at > now()
    and public.distance_miles(p_lat, p_lng, l.approx_lat, l.approx_lng) <= least(p_radius_miles, 50)
    and (p_min_skill is null or p.skill_level >= p_min_skill)
    and (p_max_skill is null or p.skill_level <= p_max_skill)
    and (p_format is null or (p_format = 'singles' and p.plays_singles) or (p_format = 'doubles' and p.plays_doubles))
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
  order by 7 asc
  limit 100;
$$;

-- Players at about your level (within half a point), who aren't your friends
-- yet, closest level first, anyone looking to play right now before the rest.
create function public.similar_players(p_format text default null)
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
  from public.profiles me
  join public.profiles p on p.id <> me.id
  where me.id = auth.uid()
    and me.skill_level is not null
    and p.deleted_at is null
    and p.skill_level is not null
    and abs(p.skill_level - me.skill_level) <= 0.5
    and (p_format is null or (p_format = 'singles' and p.plays_singles) or (p_format = 'doubles' and p.plays_doubles))
    and not public.players_blocked(me.id, p.id)
    and not public.are_friends(me.id, p.id)
  order by (p.availability = 'looking_to_play' and p.availability_expires_at > now()) desc,
           abs(p.skill_level - me.skill_level), p.display_name
  limit 30;
$$;

-- ---------------------------------------------------------------------------
-- Court champions
-- ---------------------------------------------------------------------------
-- The Court Champ is the team ranked #1 on a court's leaderboard (singles and
-- doubles each have one), but only once they have at least 6 wins there.

create function public.court_champion(p_court uuid, p_singles boolean)
returns table (team_id uuid, team_name text, wins integer)
language sql
stable
security definer
set search_path = ''
as $$
  select l.team_id, l.team_name, l.wins
  from public.court_leaderboard(p_court, p_singles) l
  where l.rank = 1 and l.wins >= 6
    and exists (select 1 from public.courts c where c.id = p_court and c.status = 'approved');
$$;

-- Courts where a team holds the crown.
create function public.team_crowns(p_team uuid)
returns table (court_id uuid, court_name text, is_singles boolean, wins integer)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, t.player_high is null, s.wins
  from public.teams t
  join public.matches m on m.status = 'confirmed' and t.id in (m.team_a_id, m.team_b_id)
  join public.courts c on c.id = m.court_id
  cross join lateral public.court_champion(c.id, t.player_high is null) s
  where t.id = p_team and s.team_id = t.id
    and not exists (
      select 1 from public.profiles p
      where p.id in (t.player_low, t.player_high) and not p.show_record and p.id <> auth.uid()
    )
  group by c.id, c.name, t.player_high, s.wins
  order by c.name;
$$;

-- Courts where any of a player's teams (singles or doubles) holds the crown.
create function public.player_crowns(p_profile uuid)
returns table (court_id uuid, court_name text, is_singles boolean, wins integer)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct k.court_id, k.court_name, k.is_singles, k.wins
  from public.teams t
  cross join lateral public.team_crowns(t.id) k
  where p_profile in (t.player_low, t.player_high)
    and not public.players_blocked(auth.uid(), p_profile)
  order by k.court_name;
$$;

revoke execute on function
  public.are_friends(uuid, uuid),
  public.challenges_check_open(),
  public.friendships_check_open(),
  public.player_open(uuid),
  public.nearby_players(double precision, double precision, double precision, numeric, numeric, text),
  public.similar_players(text),
  public.court_champion(uuid, boolean),
  public.team_crowns(uuid),
  public.player_crowns(uuid)
from public, anon, authenticated;
grant execute on function
  public.player_open(uuid),
  public.nearby_players(double precision, double precision, double precision, numeric, numeric, text),
  public.similar_players(text),
  public.court_champion(uuid, boolean),
  public.team_crowns(uuid),
  public.player_crowns(uuid)
to authenticated;

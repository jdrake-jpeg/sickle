-- Sickle V1 schema.
--
-- Core rules from the product brief:
--   * A user can belong to unlimited teams; a team is exactly two users.
--   * Verified match history is the source of truth; records and rankings are
--     derived from it and never stored as the only copy.
--   * A submitted result only counts once a player on the OTHER team confirms
--     it. Disputed or unconfirmed results never touch records or rankings.
--   * Exact user location is never exposed; only fuzzed area and distance.

create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.availability_state as enum ('off', 'area_only', 'available_nearby', 'looking_to_play');
create type public.play_intent as enum ('casual', 'competitive', 'either');
create type public.challenge_status as enum ('pending', 'countered', 'accepted', 'declined', 'cancelled', 'expired', 'completed');
create type public.match_status as enum ('submitted', 'confirmed', 'disputed', 'voided');
create type public.confirmation_decision as enum ('confirmed', 'disputed');

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username citext not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_url text,
  skill_level numeric(2, 1) check (skill_level between 1.0 and 6.0),
  home_area text,
  school text,
  intent public.play_intent not null default 'either',
  availability public.availability_state not null default 'off',
  availability_expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- Location lives in its own table so it is never readable by other users.
-- Coordinates are stored already fuzzed (rounded to roughly 1 km).
create table public.player_locations (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  approx_lat double precision not null check (approx_lat between -90 and 90),
  approx_lng double precision not null check (approx_lng between -180 and 180),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Courts
-- ---------------------------------------------------------------------------

create table public.courts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  address text,
  indoor boolean not null default false,
  court_count integer check (court_count > 0),
  created_at timestamptz not null default now()
);

create table public.preferred_courts (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  court_id uuid not null references public.courts (id) on delete cascade,
  primary key (profile_id, court_id)
);

-- ---------------------------------------------------------------------------
-- Teams: exactly two players, stored in canonical order so a pairing is unique
-- ---------------------------------------------------------------------------

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  player_low uuid not null references public.profiles (id) on delete cascade,
  player_high uuid not null references public.profiles (id) on delete cascade,
  name text check (char_length(name) <= 40),
  photo_url text,
  looking_for_opponents boolean not null default false,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  active boolean not null default true,
  check (player_low < player_high),
  unique (player_low, player_high)
);

create index teams_player_high_idx on public.teams (player_high);

-- ---------------------------------------------------------------------------
-- Challenges
-- ---------------------------------------------------------------------------

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_team_id uuid not null references public.teams (id),
  challenged_team_id uuid not null references public.teams (id),
  court_id uuid not null references public.courts (id),
  proposed_time timestamptz not null,
  ranked boolean not null default true,
  status public.challenge_status not null default 'pending',
  -- Which team must respond next. Countering flips this instead of creating
  -- a new challenge.
  awaiting_team_id uuid not null references public.teams (id),
  expires_at timestamptz not null default now() + interval '48 hours',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (challenger_team_id <> challenged_team_id),
  check (awaiting_team_id in (challenger_team_id, challenged_team_id))
);

-- ---------------------------------------------------------------------------
-- Matches, games and confirmations
-- ---------------------------------------------------------------------------

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid references public.challenges (id),
  team_a_id uuid not null references public.teams (id),
  team_b_id uuid not null references public.teams (id),
  court_id uuid not null references public.courts (id),
  played_at timestamptz not null,
  ranked boolean not null default true,
  status public.match_status not null default 'submitted',
  submitted_by uuid not null references public.profiles (id),
  submitted_by_team_id uuid not null references public.teams (id),
  winner_team_id uuid not null references public.teams (id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (team_a_id <> team_b_id),
  check (submitted_by_team_id in (team_a_id, team_b_id)),
  check (winner_team_id in (team_a_id, team_b_id))
);

create index matches_team_a_idx on public.matches (team_a_id);
create index matches_team_b_idx on public.matches (team_b_id);
create index matches_court_idx on public.matches (court_id);

create table public.games (
  match_id uuid not null references public.matches (id) on delete cascade,
  game_number smallint not null check (game_number between 1 and 3),
  team_a_score smallint not null check (team_a_score >= 0),
  team_b_score smallint not null check (team_b_score >= 0),
  primary key (match_id, game_number)
);

create table public.match_confirmations (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references public.matches (id) on delete cascade,
  team_id uuid not null references public.teams (id),
  profile_id uuid not null references public.profiles (id),
  decision public.confirmation_decision not null,
  reason text check (char_length(reason) <= 500),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Safety
-- ---------------------------------------------------------------------------

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_profile_id uuid references public.profiles (id) on delete cascade,
  match_id uuid references public.matches (id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 1000),
  created_at timestamptz not null default now(),
  check (reported_profile_id is not null or match_id is not null)
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.is_team_member(p_team uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.teams t
    where t.id = p_team and p_user in (t.player_low, t.player_high)
  );
$$;

-- Distance in miles between two points (haversine).
create function public.distance_miles(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 3958.8 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- A single pickleball game score is valid when the winner reached 11 and won
-- by at least 2, and any game past 11 ended exactly 2 points apart.
create function public.is_valid_game_score(a smallint, b smallint)
returns boolean
language sql
immutable
as $$
  select greatest(a, b) >= 11
    and abs(a - b) >= 2
    and (greatest(a, b) = 11 or abs(a - b) = 2);
$$;

-- ---------------------------------------------------------------------------
-- Teams
-- ---------------------------------------------------------------------------

-- Create Team -> pick a partner -> confirm. Returns the existing team if this
-- pairing already exists.
create function public.create_team(p_partner uuid, p_name text default null)
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
  values (least(v_me, p_partner), greatest(v_me, p_partner), p_name, v_me)
  on conflict (player_low, player_high) do update set active = true
  returning id into v_team;

  return v_team;
end;
$$;

-- ---------------------------------------------------------------------------
-- Match results: submit, then the OTHER team confirms or disputes
-- ---------------------------------------------------------------------------

-- p_games is a JSON array of [team_a_score, team_b_score] pairs, e.g.
-- '[[11,7],[9,11],[11,8]]'. The caller must be on team A or team B.
create function public.submit_match_result(
  p_team_a uuid,
  p_team_b uuid,
  p_court uuid,
  p_played_at timestamptz,
  p_games jsonb,
  p_ranked boolean default true,
  p_challenge uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_my_team uuid;
  v_a public.teams;
  v_b public.teams;
  v_count int;
  v_wins_a int := 0;
  v_wins_b int := 0;
  v_score_a smallint;
  v_score_b smallint;
  v_match uuid;
  i int;
begin
  if v_me is null then raise exception 'Not signed in'; end if;

  select * into v_a from public.teams where id = p_team_a;
  select * into v_b from public.teams where id = p_team_b;
  if v_a.id is null or v_b.id is null then raise exception 'Unknown team'; end if;
  if p_team_a = p_team_b then raise exception 'A match needs two different teams'; end if;

  -- The four players must be four different people.
  if v_a.player_low in (v_b.player_low, v_b.player_high) or v_a.player_high in (v_b.player_low, v_b.player_high) then
    raise exception 'A player cannot be on both teams';
  end if;

  if v_me in (v_a.player_low, v_a.player_high) then
    v_my_team := p_team_a;
  elsif v_me in (v_b.player_low, v_b.player_high) then
    v_my_team := p_team_b;
  else
    raise exception 'Only a player in this match can submit its result';
  end if;

  if p_played_at > now() + interval '15 minutes' then
    raise exception 'A match cannot be played in the future';
  end if;

  if jsonb_typeof(p_games) <> 'array' then raise exception 'Games must be a list of scores'; end if;
  v_count := jsonb_array_length(p_games);
  if v_count not between 2 and 3 then raise exception 'A best-of-3 match has 2 or 3 games'; end if;

  for i in 0 .. v_count - 1 loop
    -- Once a team has two wins the match is over; no extra games allowed.
    if v_wins_a = 2 or v_wins_b = 2 then raise exception 'Match was already decided before game %', i + 1; end if;
    v_score_a := (p_games -> i ->> 0)::smallint;
    v_score_b := (p_games -> i ->> 1)::smallint;
    if v_score_a is null or v_score_b is null or not public.is_valid_game_score(v_score_a, v_score_b) then
      raise exception 'Game % has an invalid score', i + 1;
    end if;
    if v_score_a > v_score_b then v_wins_a := v_wins_a + 1; else v_wins_b := v_wins_b + 1; end if;
  end loop;

  if v_wins_a < 2 and v_wins_b < 2 then raise exception 'Nobody has won two games yet'; end if;

  if p_challenge is not null and not exists (
    select 1 from public.challenges c
    where c.id = p_challenge
      and c.status = 'accepted'
      and array[c.challenger_team_id, c.challenged_team_id] @> array[p_team_a, p_team_b]
  ) then
    raise exception 'That challenge is not an accepted challenge between these teams';
  end if;

  insert into public.matches (
    challenge_id, team_a_id, team_b_id, court_id, played_at, ranked,
    submitted_by, submitted_by_team_id, winner_team_id
  ) values (
    p_challenge, p_team_a, p_team_b, p_court, p_played_at, p_ranked,
    v_me, v_my_team, case when v_wins_a = 2 then p_team_a else p_team_b end
  ) returning id into v_match;

  for i in 0 .. v_count - 1 loop
    insert into public.games (match_id, game_number, team_a_score, team_b_score)
    values (v_match, i + 1, (p_games -> i ->> 0)::smallint, (p_games -> i ->> 1)::smallint);
  end loop;

  return v_match;
end;
$$;

-- Only a player on the team that did NOT submit can confirm or dispute.
create function public.respond_to_match_result(
  p_match uuid,
  p_decision public.confirmation_decision,
  p_reason text default null
)
returns public.match_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_match public.matches;
  v_other_team uuid;
  v_status public.match_status;
begin
  if v_me is null then raise exception 'Not signed in'; end if;

  select * into v_match from public.matches where id = p_match for update;
  if v_match.id is null then raise exception 'Unknown match'; end if;
  if v_match.status <> 'submitted' then raise exception 'This result was already %', v_match.status; end if;

  v_other_team := case when v_match.submitted_by_team_id = v_match.team_a_id then v_match.team_b_id else v_match.team_a_id end;

  if not public.is_team_member(v_other_team, v_me) then
    raise exception 'Only a player on the other team can confirm or dispute this result';
  end if;

  insert into public.match_confirmations (match_id, team_id, profile_id, decision, reason)
  values (p_match, v_other_team, v_me, p_decision, p_reason);

  v_status := case when p_decision = 'confirmed' then 'confirmed'::public.match_status else 'disputed'::public.match_status end;

  update public.matches set status = v_status, resolved_at = now() where id = p_match;

  if v_status = 'confirmed' and v_match.challenge_id is not null then
    update public.challenges set status = 'completed', updated_at = now() where id = v_match.challenge_id;
  end if;

  return v_status;
end;
$$;

-- ---------------------------------------------------------------------------
-- Challenges
-- ---------------------------------------------------------------------------

create function public.send_challenge(
  p_my_team uuid,
  p_their_team uuid,
  p_court uuid,
  p_time timestamptz,
  p_ranked boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if not public.is_team_member(p_my_team, v_me) then raise exception 'You are not on that team'; end if;
  if p_time < now() then raise exception 'Pick a time in the future'; end if;

  insert into public.challenges (challenger_team_id, challenged_team_id, court_id, proposed_time, ranked, awaiting_team_id, created_by)
  values (p_my_team, p_their_team, p_court, p_time, p_ranked, p_their_team, v_me)
  returning id into v_id;
  return v_id;
end;
$$;

-- Accept, decline, or counter with a new court and/or time. Only the team the
-- challenge is waiting on can respond.
create function public.respond_to_challenge(
  p_challenge uuid,
  p_action text,
  p_court uuid default null,
  p_time timestamptz default null
)
returns public.challenge_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_c public.challenges;
begin
  select * into v_c from public.challenges where id = p_challenge for update;
  if v_c.id is null then raise exception 'Unknown challenge'; end if;
  if v_c.status not in ('pending', 'countered') then raise exception 'This challenge is already %', v_c.status; end if;
  if v_c.expires_at < now() then
    update public.challenges set status = 'expired', updated_at = now() where id = p_challenge;
    return 'expired';
  end if;
  if not public.is_team_member(v_c.awaiting_team_id, v_me) then
    raise exception 'It is the other team''s turn to respond';
  end if;

  if p_action = 'accept' then
    update public.challenges set status = 'accepted', updated_at = now() where id = p_challenge;
    return 'accepted';
  elsif p_action = 'decline' then
    update public.challenges set status = 'declined', updated_at = now() where id = p_challenge;
    return 'declined';
  elsif p_action = 'counter' then
    if p_court is null and p_time is null then raise exception 'A counter needs a new court or time'; end if;
    if p_time is not null and p_time < now() then raise exception 'Pick a time in the future'; end if;
    update public.challenges set
      status = 'countered',
      court_id = coalesce(p_court, court_id),
      proposed_time = coalesce(p_time, proposed_time),
      awaiting_team_id = case when awaiting_team_id = challenger_team_id then challenged_team_id else challenger_team_id end,
      expires_at = now() + interval '48 hours',
      updated_at = now()
    where id = p_challenge;
    return 'countered';
  else
    raise exception 'Unknown action %', p_action;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Availability and nearby discovery (privacy-preserving)
-- ---------------------------------------------------------------------------

create function public.set_availability(
  p_state public.availability_state,
  p_lat double precision default null,
  p_lng double precision default null,
  p_expires_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not signed in'; end if;

  update public.profiles
  set availability = p_state,
      availability_expires_at = case when p_state = 'looking_to_play' then p_expires_at else null end
  where id = v_me;

  if p_state = 'off' then
    delete from public.player_locations where profile_id = v_me;
  elsif p_lat is not null and p_lng is not null then
    -- Round to 2 decimals (about 1 km) before storing.
    insert into public.player_locations (profile_id, approx_lat, approx_lng, updated_at)
    values (v_me, round(p_lat::numeric, 2), round(p_lng::numeric, 2), now())
    on conflict (profile_id) do update
      set approx_lat = excluded.approx_lat, approx_lng = excluded.approx_lng, updated_at = now();
  end if;
end;
$$;

-- Players near a point, with distance rounded to the nearest half mile.
-- Never returns coordinates. Skips blocked players in both directions.
create function public.nearby_players(
  p_lat double precision,
  p_lng double precision,
  p_radius_miles double precision default 5,
  p_min_skill numeric default null,
  p_max_skill numeric default null
)
returns table (
  profile_id uuid,
  display_name text,
  username citext,
  avatar_url text,
  skill_level numeric,
  availability public.availability_state,
  distance_miles double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.username, p.avatar_url, p.skill_level, p.availability,
         greatest(0.5, round((public.distance_miles(p_lat, p_lng, l.approx_lat, l.approx_lng) * 2)::numeric) / 2)::double precision
  from public.profiles p
  join public.player_locations l on l.profile_id = p.id
  where p.id <> auth.uid()
    and p.availability in ('available_nearby', 'looking_to_play')
    and (p.availability <> 'looking_to_play' or p.availability_expires_at is null or p.availability_expires_at > now())
    and public.distance_miles(p_lat, p_lng, l.approx_lat, l.approx_lng) <= least(p_radius_miles, 50)
    and (p_min_skill is null or p.skill_level >= p_min_skill)
    and (p_max_skill is null or p.skill_level <= p_max_skill)
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
  order by 7 asc
  limit 100;
$$;

-- ---------------------------------------------------------------------------
-- Derived records (only confirmed, ranked matches count)
-- ---------------------------------------------------------------------------

create view public.team_records
with (security_invoker = true)
as
select t.id as team_id,
       count(m.id) filter (where m.winner_team_id = t.id) as wins,
       count(m.id) filter (where m.winner_team_id <> t.id) as losses
from public.teams t
left join public.matches m
  on m.status = 'confirmed' and m.ranked and t.id in (m.team_a_id, m.team_b_id)
group by t.id;

create view public.court_team_records
with (security_invoker = true)
as
select m.court_id,
       t.id as team_id,
       count(*) filter (where m.winner_team_id = t.id) as wins,
       count(*) filter (where m.winner_team_id <> t.id) as losses
from public.matches m
join public.teams t on t.id in (m.team_a_id, m.team_b_id)
where m.status = 'confirmed' and m.ranked
group by m.court_id, t.id;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.player_locations enable row level security;
alter table public.courts enable row level security;
alter table public.preferred_courts enable row level security;
alter table public.teams enable row level security;
alter table public.challenges enable row level security;
alter table public.matches enable row level security;
alter table public.games enable row level security;
alter table public.match_confirmations enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;

-- Profiles: public to signed-in users; you edit only your own.
create policy "profiles readable" on public.profiles for select to authenticated using (true);
create policy "insert own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Locations: only your own row, and only through set_availability.
create policy "read own location" on public.player_locations for select to authenticated using (profile_id = auth.uid());

-- Courts: readable by all signed-in users. Adding courts is admin-only for now.
create policy "courts readable" on public.courts for select to authenticated using (true);

create policy "preferred courts readable" on public.preferred_courts for select to authenticated using (true);
create policy "manage own preferred courts" on public.preferred_courts for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Teams, matches, games, challenges and confirmations are public records.
-- Writes go only through the security-definer functions above.
create policy "teams readable" on public.teams for select to authenticated using (true);
create policy "members update team" on public.teams for update to authenticated
  using (auth.uid() in (player_low, player_high)) with check (auth.uid() in (player_low, player_high));
create policy "challenges readable" on public.challenges for select to authenticated using (true);
create policy "matches readable" on public.matches for select to authenticated using (true);
create policy "games readable" on public.games for select to authenticated using (true);
create policy "confirmations readable" on public.match_confirmations for select to authenticated using (true);

create policy "own blocks" on public.blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
create policy "file reports" on public.reports for insert to authenticated with check (reporter_id = auth.uid());

-- Team members cannot rewrite who is on a team.
revoke update on public.teams from authenticated;
grant update (name, photo_url, looking_for_opponents, active) on public.teams to authenticated;

-- Functions are callable by signed-in users only.
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.create_team(uuid, text),
  public.submit_match_result(uuid, uuid, uuid, timestamptz, jsonb, boolean, uuid),
  public.respond_to_match_result(uuid, public.confirmation_decision, text),
  public.send_challenge(uuid, uuid, uuid, timestamptz, boolean),
  public.respond_to_challenge(uuid, text, uuid, timestamptz),
  public.set_availability(public.availability_state, double precision, double precision, timestamptz),
  public.nearby_players(double precision, double precision, double precision, numeric, numeric)
to authenticated;

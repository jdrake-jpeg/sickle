-- Sickle first release (October) schema.
--
-- Rules from the product brief and the plan doc's first-release scope:
--   * A user can belong to unlimited teams; a team is exactly two users.
--   * Every match is ranked and comes from an accepted challenge.
--   * A result counts only when both teams agree on the exact score. The other
--     team confirms, or disputes with the score they think is right. After two
--     corrections a further dispute goes to an admin. Nothing auto-confirms.
--   * Verified matches are the source of truth; records and leaderboards are
--     derived from them by replaceable functions and views.
--   * Exact user location is never exposed; only rough distance.
--
-- Writes to matches, games, challenges and teams happen only through the
-- security-definer functions below. Admins work from the Supabase dashboard.

create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.availability_state as enum ('off', 'looking_to_play');
create type public.challenge_status as enum ('pending', 'accepted', 'declined', 'cancelled', 'completed');
create type public.match_status as enum ('awaiting_confirmation', 'confirmed', 'needs_admin', 'unconfirmed', 'voided');
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
  availability public.availability_state not null default 'off',
  availability_expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- Location lives in its own table so other users can never read it.
-- Coordinates are stored already rounded (roughly 1 km).
create table public.player_locations (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  approx_lat double precision not null check (approx_lat between -90 and 90),
  approx_lng double precision not null check (approx_lng between -180 and 180),
  updated_at timestamptz not null default now()
);

-- Expo push tokens, for challenge and score notifications.
create table public.push_tokens (
  token text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Courts (hand-entered Rexburg list)
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
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  check (player_low < player_high),
  unique (player_low, player_high)
);

create index teams_player_high_idx on public.teams (player_high);

-- ---------------------------------------------------------------------------
-- Challenges (send, accept or decline; always ranked)
-- ---------------------------------------------------------------------------

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_team_id uuid not null references public.teams (id),
  challenged_team_id uuid not null references public.teams (id),
  court_id uuid not null references public.courts (id),
  proposed_time timestamptz not null,
  status public.challenge_status not null default 'pending',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (challenger_team_id <> challenged_team_id)
);

create index challenges_challenger_idx on public.challenges (challenger_team_id);
create index challenges_challenged_idx on public.challenges (challenged_team_id);

-- ---------------------------------------------------------------------------
-- Matches, games, score proposals and confirmations
-- ---------------------------------------------------------------------------

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null unique references public.challenges (id),
  team_a_id uuid not null references public.teams (id),
  team_b_id uuid not null references public.teams (id),
  court_id uuid not null references public.courts (id),
  played_at timestamptz not null,
  status public.match_status not null default 'awaiting_confirmation',
  -- The team that must confirm or dispute next. Null once resolved.
  awaiting_team_id uuid references public.teams (id),
  -- How many corrections have been proposed (at most 2).
  correction_count smallint not null default 0 check (correction_count between 0 and 2),
  -- Winner under the scores currently on the table.
  winner_team_id uuid not null references public.teams (id),
  submitted_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (team_a_id <> team_b_id),
  check (winner_team_id in (team_a_id, team_b_id)),
  check (awaiting_team_id is null or awaiting_team_id in (team_a_id, team_b_id)),
  check ((status = 'awaiting_confirmation') = (awaiting_team_id is not null))
);

create index matches_team_a_idx on public.matches (team_a_id);
create index matches_team_b_idx on public.matches (team_b_id);
create index matches_court_idx on public.matches (court_id, status);

-- The scores currently on the table. Replaced when a correction is proposed.
create table public.games (
  match_id uuid not null references public.matches (id) on delete cascade,
  game_number smallint not null check (game_number between 1 and 3),
  team_a_score smallint not null check (team_a_score >= 0),
  team_b_score smallint not null check (team_b_score >= 0),
  primary key (match_id, game_number)
);

-- Every score anyone proposed: round 0 is the original submission, rounds 1
-- and 2 are corrections. Kept for admins resolving disputes.
create table public.score_proposals (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  round smallint not null check (round between 0 and 2),
  team_id uuid not null references public.teams (id),
  profile_id uuid not null references public.profiles (id),
  scores jsonb not null,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (match_id, round)
);

create table public.match_confirmations (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  round smallint not null,
  team_id uuid not null references public.teams (id),
  profile_id uuid not null references public.profiles (id),
  decision public.confirmation_decision not null,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (match_id, round)
);

-- Any change to a match after it is confirmed (by an admin) is logged.
create table public.match_audit_log (
  id bigint generated always as identity primary key,
  match_id uuid not null,
  table_name text not null,
  old_row jsonb,
  new_row jsonb,
  changed_by uuid,
  db_role text not null default current_user,
  changed_at timestamptz not null default now()
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

create function public.team_display_name(p_team uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(t.name, a.display_name || ' + ' || b.display_name)
  from public.teams t
  join public.profiles a on a.id = t.player_low
  join public.profiles b on b.id = t.player_high
  where t.id = p_team;
$$;

-- True if anyone on one team has blocked anyone on the other.
create function public.teams_blocked(p_team_1 uuid, p_team_2 uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.teams t1, public.teams t2, public.blocks b
    where t1.id = p_team_1 and t2.id = p_team_2
      and (
        (b.blocker_id in (t1.player_low, t1.player_high) and b.blocked_id in (t2.player_low, t2.player_high))
        or (b.blocker_id in (t2.player_low, t2.player_high) and b.blocked_id in (t1.player_low, t1.player_high))
      )
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

-- A game score is valid when the winner reached 11 and won by at least 2, and
-- any game past 11 ended exactly 2 points apart.
create function public.is_valid_game_score(a smallint, b smallint)
returns boolean
language sql
immutable
as $$
  select greatest(a, b) >= 11
    and abs(a - b) >= 2
    and (greatest(a, b) = 11 or abs(a - b) = 2);
$$;

-- Checks a best-of-3 score list like '[[11,7],[9,11],[11,8]]' (team A score
-- first) and returns 'a' or 'b' for the winner. Raises on anything invalid.
create function public.best_of_three_winner(p_games jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_count int;
  v_wins_a int := 0;
  v_wins_b int := 0;
  v_a smallint;
  v_b smallint;
  i int;
begin
  if p_games is null or jsonb_typeof(p_games) <> 'array' then raise exception 'Scores must be a list of games'; end if;
  v_count := jsonb_array_length(p_games);
  if v_count not between 2 and 3 then raise exception 'A best-of-3 match has 2 or 3 games'; end if;

  for i in 0 .. v_count - 1 loop
    if v_wins_a = 2 or v_wins_b = 2 then raise exception 'The match was already decided before game %', i + 1; end if;
    if jsonb_typeof(p_games -> i) <> 'array' or jsonb_array_length(p_games -> i) <> 2 then
      raise exception 'Game % needs two scores', i + 1;
    end if;
    v_a := (p_games -> i ->> 0)::smallint;
    v_b := (p_games -> i ->> 1)::smallint;
    if v_a is null or v_b is null or not public.is_valid_game_score(v_a, v_b) then
      raise exception 'Game % has an invalid score', i + 1;
    end if;
    if v_a > v_b then v_wins_a := v_wins_a + 1; else v_wins_b := v_wins_b + 1; end if;
  end loop;

  if v_wins_a < 2 and v_wins_b < 2 then raise exception 'Nobody has won two games yet'; end if;
  return case when v_wins_a = 2 then 'a' else 'b' end;
end;
$$;

-- Replaces a match's current games with the given scores.
create function public.replace_games(p_match uuid, p_games jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  i int;
begin
  delete from public.games where match_id = p_match;
  for i in 0 .. jsonb_array_length(p_games) - 1 loop
    insert into public.games (match_id, game_number, team_a_score, team_b_score)
    values (p_match, i + 1, (p_games -> i ->> 0)::smallint, (p_games -> i ->> 1)::smallint);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Teams
-- ---------------------------------------------------------------------------

-- Create Team -> pick a player -> confirm. Returns the existing team if this
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
  values (least(v_me, p_partner), greatest(v_me, p_partner), nullif(trim(p_name), ''), v_me)
  on conflict (player_low, player_high) do update set name = coalesce(excluded.name, public.teams.name)
  returning id into v_team;

  return v_team;
end;
$$;

-- ---------------------------------------------------------------------------
-- Challenges
-- ---------------------------------------------------------------------------

create function public.send_challenge(p_my_team uuid, p_their_team uuid, p_court uuid, p_time timestamptz)
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
  select * into v_mine from public.teams where id = p_my_team;
  select * into v_theirs from public.teams where id = p_their_team;
  if v_theirs.id is null then raise exception 'Unknown team'; end if;
  if v_mine.player_low in (v_theirs.player_low, v_theirs.player_high)
     or v_mine.player_high in (v_theirs.player_low, v_theirs.player_high) then
    raise exception 'A player cannot be on both teams';
  end if;
  if public.teams_blocked(p_my_team, p_their_team) then raise exception 'You cannot challenge this team'; end if;
  if p_time < now() then raise exception 'Pick a time in the future'; end if;

  insert into public.challenges (challenger_team_id, challenged_team_id, court_id, proposed_time, created_by)
  values (p_my_team, p_their_team, p_court, p_time, v_me)
  returning id into v_id;
  return v_id;
end;
$$;

-- Only a player on the challenged team can accept or decline.
create function public.respond_to_challenge(p_challenge uuid, p_accept boolean)
returns public.challenge_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.challenges;
  v_status public.challenge_status := case when p_accept then 'accepted'::public.challenge_status else 'declined'::public.challenge_status end;
begin
  select * into v_c from public.challenges where id = p_challenge for update;
  if v_c.id is null then raise exception 'Unknown challenge'; end if;
  if v_c.status <> 'pending' then raise exception 'This challenge is already %', v_c.status; end if;
  if not public.is_team_member(v_c.challenged_team_id, auth.uid()) then
    raise exception 'Only the challenged team can respond';
  end if;
  update public.challenges set status = v_status, updated_at = now() where id = p_challenge;
  return v_status;
end;
$$;

-- Either team can call off a challenge before a score is entered.
create function public.cancel_challenge(p_challenge uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.challenges;
begin
  select * into v_c from public.challenges where id = p_challenge for update;
  if v_c.id is null then raise exception 'Unknown challenge'; end if;
  if not (public.is_team_member(v_c.challenger_team_id, auth.uid()) or public.is_team_member(v_c.challenged_team_id, auth.uid())) then
    raise exception 'You are not in this challenge';
  end if;
  if v_c.status not in ('pending', 'accepted') or exists (select 1 from public.matches where challenge_id = p_challenge) then
    raise exception 'This challenge can no longer be cancelled';
  end if;
  update public.challenges set status = 'cancelled', updated_at = now() where id = p_challenge;
end;
$$;

-- ---------------------------------------------------------------------------
-- Match results: submit, then the other team confirms or corrects
-- ---------------------------------------------------------------------------

-- Any of the four players enters the scores for an accepted challenge.
-- p_games lists [challenger score, challenged score] per game.
create function public.submit_match_result(p_challenge uuid, p_games jsonb, p_played_at timestamptz default now())
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_c public.challenges;
  v_my_team uuid;
  v_other_team uuid;
  v_winner text;
  v_match uuid;
begin
  if v_me is null then raise exception 'Not signed in'; end if;

  select * into v_c from public.challenges where id = p_challenge for update;
  if v_c.id is null then raise exception 'Unknown challenge'; end if;
  if v_c.status <> 'accepted' then raise exception 'Scores can only be entered for an accepted challenge'; end if;
  if exists (select 1 from public.matches where challenge_id = p_challenge) then
    raise exception 'A score was already entered for this challenge';
  end if;

  if public.is_team_member(v_c.challenger_team_id, v_me) then
    v_my_team := v_c.challenger_team_id;
    v_other_team := v_c.challenged_team_id;
  elsif public.is_team_member(v_c.challenged_team_id, v_me) then
    v_my_team := v_c.challenged_team_id;
    v_other_team := v_c.challenger_team_id;
  else
    raise exception 'Only a player in this match can enter its score';
  end if;

  if p_played_at > now() + interval '15 minutes' then raise exception 'A match cannot be played in the future'; end if;

  v_winner := public.best_of_three_winner(p_games);

  insert into public.matches (challenge_id, team_a_id, team_b_id, court_id, played_at, awaiting_team_id, winner_team_id, submitted_by)
  values (
    p_challenge, v_c.challenger_team_id, v_c.challenged_team_id, v_c.court_id, p_played_at, v_other_team,
    case when v_winner = 'a' then v_c.challenger_team_id else v_c.challenged_team_id end, v_me
  )
  returning id into v_match;

  perform public.replace_games(v_match, p_games);
  insert into public.score_proposals (match_id, round, team_id, profile_id, scores)
  values (v_match, 0, v_my_team, v_me, p_games);

  return v_match;
end;
$$;

-- A player on the team the match is waiting on agrees with the scores.
create function public.confirm_match_result(p_match uuid)
returns public.match_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.matches;
begin
  select * into v_m from public.matches where id = p_match for update;
  if v_m.id is null then raise exception 'Unknown match'; end if;
  if v_m.status <> 'awaiting_confirmation' then raise exception 'This result is already %', v_m.status; end if;
  if not public.is_team_member(v_m.awaiting_team_id, auth.uid()) then
    raise exception 'Only a player on the other team can confirm this score';
  end if;

  insert into public.match_confirmations (match_id, round, team_id, profile_id, decision)
  values (p_match, v_m.correction_count, v_m.awaiting_team_id, auth.uid(), 'confirmed');

  update public.matches
  set status = 'confirmed', awaiting_team_id = null, resolved_at = now(), updated_at = now()
  where id = p_match;
  update public.challenges set status = 'completed', updated_at = now() where id = v_m.challenge_id;

  return 'confirmed';
end;
$$;

-- A player on the team the match is waiting on disagrees. They enter the
-- score they think is right, which goes back to the other team. After two
-- corrections, a further dispute sends the match to an admin (p_games is then
-- kept for the admin but not put on the table).
create function public.dispute_match_result(p_match uuid, p_games jsonb, p_note text default null)
returns public.match_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.matches;
  v_disputer uuid;
  v_winner text;
  v_current jsonb;
begin
  select * into v_m from public.matches where id = p_match for update;
  if v_m.id is null then raise exception 'Unknown match'; end if;
  if v_m.status <> 'awaiting_confirmation' then raise exception 'This result is already %', v_m.status; end if;
  v_disputer := v_m.awaiting_team_id;
  if not public.is_team_member(v_disputer, auth.uid()) then
    raise exception 'Only a player on the other team can dispute this score';
  end if;

  v_winner := public.best_of_three_winner(p_games);

  select jsonb_agg(jsonb_build_array(team_a_score, team_b_score) order by game_number) into v_current
  from public.games where match_id = p_match;
  if v_current = p_games then raise exception 'That is the same score. Confirm it instead'; end if;

  insert into public.match_confirmations (match_id, round, team_id, profile_id, decision, note)
  values (p_match, v_m.correction_count, v_disputer, auth.uid(), 'disputed', p_note);

  if v_m.correction_count >= 2 then
    update public.matches
    set status = 'needs_admin', awaiting_team_id = null, updated_at = now()
    where id = p_match;
    return 'needs_admin';
  end if;

  insert into public.score_proposals (match_id, round, team_id, profile_id, scores, note)
  values (p_match, v_m.correction_count + 1, v_disputer, auth.uid(), p_games, p_note);
  perform public.replace_games(p_match, p_games);

  update public.matches
  set correction_count = correction_count + 1,
      awaiting_team_id = case when v_disputer = team_a_id then team_b_id else team_a_id end,
      winner_team_id = case when v_winner = 'a' then team_a_id else team_b_id end,
      updated_at = now()
  where id = p_match;

  return 'awaiting_confirmation';
end;
$$;

-- Results nobody answered for 72 hours become Unconfirmed: they stay in
-- history but never count. Schedule with pg_cron, e.g. hourly:
--   select cron.schedule('expire-results', '0 * * * *', 'select public.expire_unanswered_results()');
create function public.expire_unanswered_results()
returns integer
language sql
security definer
set search_path = ''
as $$
  with expired as (
    update public.matches
    set status = 'unconfirmed', awaiting_team_id = null, resolved_at = now(), updated_at = now()
    where status = 'awaiting_confirmation' and updated_at < now() - interval '72 hours'
    returning 1
  )
  select count(*)::int from expired;
$$;

create function public.log_confirmed_match_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match uuid := coalesce(new.match_id, old.match_id);
begin
  if exists (select 1 from public.matches where id = v_match and status in ('confirmed', 'needs_admin', 'voided')) then
    insert into public.match_audit_log (match_id, table_name, old_row, new_row, changed_by)
    values (v_match, tg_table_name, to_jsonb(old), to_jsonb(new), auth.uid());
  end if;
  return null;
end;
$$;

create function public.log_match_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status in ('confirmed', 'needs_admin', 'voided') then
    insert into public.match_audit_log (match_id, table_name, old_row, new_row, changed_by)
    values (old.id, 'matches', to_jsonb(old), to_jsonb(new), auth.uid());
  end if;
  return null;
end;
$$;

create trigger matches_audit after update on public.matches
  for each row execute function public.log_match_change();

-- games has no id column, so expose match_id to the generic logger.
create trigger games_audit after update or delete on public.games
  for each row execute function public.log_confirmed_match_change();

-- ---------------------------------------------------------------------------
-- Looking to Play and nearby discovery (privacy-preserving)
-- ---------------------------------------------------------------------------

-- Turn Looking to Play on until p_until (at most 24 hours ahead), or off.
create function public.set_looking_to_play(
  p_on boolean,
  p_until timestamptz default null,
  p_lat double precision default null,
  p_lng double precision default null
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

  if not p_on then
    update public.profiles set availability = 'off', availability_expires_at = null where id = v_me;
    delete from public.player_locations where profile_id = v_me;
    return;
  end if;

  if p_until is null or p_until <= now() or p_until > now() + interval '24 hours' then
    raise exception 'Pick an end time within the next 24 hours';
  end if;
  if p_lat is null or p_lng is null then raise exception 'Location is needed to show you to nearby players'; end if;

  update public.profiles set availability = 'looking_to_play', availability_expires_at = p_until where id = v_me;
  -- Round to 2 decimals (about 1 km) before storing.
  insert into public.player_locations (profile_id, approx_lat, approx_lng, updated_at)
  values (v_me, round(p_lat::numeric, 2), round(p_lng::numeric, 2), now())
  on conflict (profile_id) do update
    set approx_lat = excluded.approx_lat, approx_lng = excluded.approx_lng, updated_at = now();
end;
$$;

-- Players Looking to Play near a point, distance rounded to the nearest half
-- mile. Never returns coordinates. Skips blocked players in both directions.
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
  looking_until timestamptz,
  distance_miles double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.username, p.avatar_url, p.skill_level, p.availability_expires_at,
         greatest(0.5, round((public.distance_miles(p_lat, p_lng, l.approx_lat, l.approx_lng) * 2)::numeric) / 2)::double precision
  from public.profiles p
  join public.player_locations l on l.profile_id = p.id
  where p.id <> auth.uid()
    and p.availability = 'looking_to_play'
    and p.availability_expires_at > now()
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

create function public.search_players(p_query text)
returns table (profile_id uuid, display_name text, username citext, avatar_url text, skill_level numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.username, p.avatar_url, p.skill_level
  from public.profiles p
  where char_length(trim(p_query)) >= 2
    and p.id <> auth.uid()
    and (p.username::text ilike replace(replace(trim(p_query), '%', ''), '_', '\_') || '%'
         or p.display_name ilike '%' || replace(replace(trim(p_query), '%', ''), '_', '\_') || '%')
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
  order by p.username
  limit 20;
$$;

-- ---------------------------------------------------------------------------
-- Derived records and court leaderboards (confirmed matches only)
-- ---------------------------------------------------------------------------

create view public.team_records
with (security_invoker = true)
as
select t.id as team_id,
       count(m.id) filter (where m.winner_team_id = t.id) as wins,
       count(m.id) filter (where m.winner_team_id <> t.id) as losses
from public.teams t
left join public.matches m on m.status = 'confirmed' and t.id in (m.team_a_id, m.team_b_id)
group by t.id;

create view public.player_records
with (security_invoker = true)
as
select p.id as profile_id,
       count(m.id) filter (where m.winner_team_id = t.id) as wins,
       count(m.id) filter (where m.winner_team_id <> t.id) as losses
from public.profiles p
left join public.teams t on p.id in (t.player_low, t.player_high)
left join public.matches m on m.status = 'confirmed' and t.id in (m.team_a_id, m.team_b_id)
group by p.id;

-- For admins: teams that keep ending up in disputes.
create view public.team_dispute_counts
with (security_invoker = true)
as
select c.team_id, count(*) as disputes, max(c.created_at) as last_dispute_at
from public.match_confirmations c
where c.decision = 'disputed'
group by c.team_id;

-- Court doubles leaderboard. First algorithm: Elo per team per court
-- (start 1000, K = 32), replayed from confirmed matches in order, so beating a
-- much weaker team earns little. Swap this function to change the algorithm;
-- match history is untouched. Rank 1 holds the Court Champs crown.
create function public.court_leaderboard(p_court uuid)
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
    where mm.court_id = p_court and mm.status = 'confirmed'
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

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.player_locations enable row level security;
alter table public.push_tokens enable row level security;
alter table public.courts enable row level security;
alter table public.preferred_courts enable row level security;
alter table public.teams enable row level security;
alter table public.challenges enable row level security;
alter table public.matches enable row level security;
alter table public.games enable row level security;
alter table public.score_proposals enable row level security;
alter table public.match_confirmations enable row level security;
alter table public.match_audit_log enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;

-- Profiles: readable by signed-in users; you edit only your own.
create policy "profiles readable" on public.profiles for select to authenticated using (true);
create policy "insert own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Locations and push tokens: only your own rows.
create policy "read own location" on public.player_locations for select to authenticated using (profile_id = auth.uid());
create policy "own push tokens" on public.push_tokens for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Courts are entered by admins; everyone signed in can read them.
create policy "courts readable" on public.courts for select to authenticated using (true);
create policy "preferred courts readable" on public.preferred_courts for select to authenticated using (true);
create policy "manage own preferred courts" on public.preferred_courts for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Teams, challenges and match records are public to signed-in users.
-- Writes go only through the functions above.
create policy "teams readable" on public.teams for select to authenticated using (true);
create policy "challenges readable" on public.challenges for select to authenticated using (true);
create policy "matches readable" on public.matches for select to authenticated using (true);
create policy "games readable" on public.games for select to authenticated using (true);
create policy "proposals readable" on public.score_proposals for select to authenticated using (true);
create policy "confirmations readable" on public.match_confirmations for select to authenticated using (true);

create policy "own blocks" on public.blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
create policy "file reports" on public.reports for insert to authenticated with check (reporter_id = auth.uid());

-- Users can't change usernames' owner or their availability directly.
revoke update on public.profiles from authenticated;
grant update (username, display_name, avatar_url, skill_level) on public.profiles to authenticated;

-- Functions are callable by signed-in users only; helpers stay internal.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.create_team(uuid, text),
  public.send_challenge(uuid, uuid, uuid, timestamptz),
  public.respond_to_challenge(uuid, boolean),
  public.cancel_challenge(uuid),
  public.submit_match_result(uuid, jsonb, timestamptz),
  public.confirm_match_result(uuid),
  public.dispute_match_result(uuid, jsonb, text),
  public.set_looking_to_play(boolean, timestamptz, double precision, double precision),
  public.nearby_players(double precision, double precision, double precision, numeric, numeric),
  public.search_players(text),
  public.court_leaderboard(uuid),
  public.team_display_name(uuid)
to authenticated;

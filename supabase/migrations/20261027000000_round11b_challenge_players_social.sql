-- Round 11b: challenges with a say for every player, open spots, edits after
-- sending, friends and opponents on profiles, a Closed court condition, and
-- court submissions that always go to review.
-- Run once, in the SQL Editor, after 20261026.

-- ---------------------------------------------------------------------------
-- Court conditions: a Closed option
-- ---------------------------------------------------------------------------
alter type public.court_condition add value if not exists 'closed';

-- ---------------------------------------------------------------------------
-- Courts an admin adds go to review like everyone else's
-- ---------------------------------------------------------------------------
create or replace function public.submit_court(
  p_name text,
  p_lat double precision,
  p_lng double precision,
  p_address text default null,
  p_court_count integer default null,
  p_indoor boolean default false,
  p_note text default null,
  p_google_place_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_name text := btrim(p_name);
  v_admin boolean := public.is_admin();
  v_place text := nullif(btrim(p_google_place_id), '');
  v_id uuid;
begin
  if v_me is null or not exists (select 1 from public.profiles where id = v_me) then
    raise exception 'Finish setting up your profile first';
  end if;
  if v_name is null or char_length(v_name) not between 2 and 60 then
    raise exception 'Give the court a name (2 to 60 characters)';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Drop a pin on the court';
  end if;
  if p_court_count is not null and p_court_count not between 1 and 50 then
    raise exception 'Number of courts should be between 1 and 50';
  end if;
  if not v_admin and public.courts_added_today(v_me) >= 3 then
    raise exception 'You can add 3 courts a day. Try again tomorrow';
  end if;
  if not v_admin and (select count(*) from public.courts where submitted_by = v_me and status = 'pending' and not is_private) >= 5 then
    raise exception 'You have 5 courts waiting for review. Wait for those first';
  end if;
  -- Same Google place, or within about 100 meters: the same court.
  if exists (
    select 1 from public.courts
    where status <> 'rejected' and not is_private
      and ((v_place is not null and google_place_id = v_place) or public.distance_miles(lat, lng, p_lat, p_lng) < 0.06)
  ) then
    raise exception 'That court is already listed or waiting for review';
  end if;

  -- A rejected court from the same Google place gives up its place id.
  if v_place is not null then
    update public.courts set google_place_id = null where google_place_id = v_place and status = 'rejected';
  end if;

  -- Everyone's courts wait for review, admins included.
  insert into public.courts (name, lat, lng, address, court_count, indoor, status, submitted_by, submission_note, google_place_id)
  values (v_name, p_lat, p_lng, nullif(btrim(p_address), ''), p_court_count, coalesce(p_indoor, false),
          'pending'::public.court_status, v_me, nullif(btrim(p_note), ''), v_place)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Challenges can have an open spot (no opponent picked yet)
-- ---------------------------------------------------------------------------
alter table public.challenges alter column challenged_team_id drop not null;

-- One row per player on a challenge, so everyone has their own OK.
-- side a is the player who sent it and their partner, side b is the other team.
create table public.challenge_players (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  side text not null check (side in ('a', 'b')),
  response text not null default 'pending' check (response in ('pending', 'in', 'out')),
  responded_at timestamptz,
  primary key (challenge_id, profile_id)
);
create index challenge_players_profile_idx on public.challenge_players (profile_id);
alter table public.challenge_players enable row level security;
revoke all on public.challenge_players from authenticated, anon;

-- Games that are already set up keep working: everyone on a team that was
-- already playing is "in", and the team that hasn't answered yet is waiting.
insert into public.challenge_players (challenge_id, profile_id, side, response, responded_at)
select c.id, x.pid, x.side,
       case when c.status = 'accepted' then 'in'
            when x.side = 'a' then 'in'
            when c.status = 'declined' then 'out'
            else 'pending' end,
       case when c.status = 'accepted' or x.side = 'a' or c.status = 'declined' then c.updated_at end
from public.challenges c
cross join lateral (
  select unnest(array[t.player_low, t.player_high]) as pid, 'a'::text as side from public.teams t where t.id = c.challenger_team_id
  union all
  select unnest(array[t.player_low, t.player_high]), 'b'::text from public.teams t where t.id = c.challenged_team_id
) x
where x.pid is not null
  and c.status in ('pending', 'accepted', 'declined')
  and not c.logged
  and not exists (select 1 from public.matches m where m.challenge_id = c.id)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Helpers (not callable from the app)
-- ---------------------------------------------------------------------------

-- Makes the player rows match the two teams. New people are waiting for an OK
-- (you, and people you added by name, are in already). If a time, court or
-- length changed, everyone but you has to say OK again.
create function public.challenge_sync_players(p_challenge uuid, p_reset_all boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.challenges;
  v_court text;
  v_singles boolean;
  r record;
  v_new boolean;
  v_pending boolean;
begin
  select * into v_c from public.challenges where id = p_challenge;
  if v_c.id is null then return; end if;
  select name into v_court from public.courts where id = v_c.court_id;
  select coalesce(t.player_high is null, false) and not v_c.challenger_needs_partner into v_singles
  from public.teams t where t.id = v_c.challenger_team_id;

  delete from public.challenge_players cp
  where cp.challenge_id = p_challenge
    and cp.profile_id not in (
      select y from public.teams t cross join lateral unnest(array[t.player_low, t.player_high]) as y
      where t.id in (v_c.challenger_team_id, v_c.challenged_team_id) and y is not null
    );

  for r in
    select distinct x as pid, case when t.id = v_c.challenger_team_id then 'a' else 'b' end as side,
           coalesce(pr.is_placeholder, false) as placeholder
    from public.teams t
    cross join lateral unnest(array[t.player_low, t.player_high]) as x
    join public.profiles pr on pr.id = x
    where t.id in (v_c.challenger_team_id, v_c.challenged_team_id) and x is not null
  loop
    v_pending := r.pid <> v_c.created_by and not r.placeholder;
    v_new := false;
    insert into public.challenge_players (challenge_id, profile_id, side, response, responded_at)
    values (p_challenge, r.pid, r.side, case when v_pending then 'pending' else 'in' end, case when v_pending then null else now() end)
    on conflict (challenge_id, profile_id) do nothing
    returning true into v_new;
    v_new := coalesce(v_new, false);

    if v_new and v_pending then
      if r.side = 'b' then
        perform public.notify(
          r.pid, 'challenges',
          case when v_singles then 'New singles challenge' else 'New doubles challenge' end,
          public.team_display_name(v_c.challenger_team_id) || ' challenged you at ' || coalesce(v_court, 'a court') || case when v_c.best_of = 1 then ', one game' else ', best of 3' end,
          jsonb_build_object('path', '/challenges')
        );
      else
        perform public.notify(
          r.pid, 'challenges', 'Doubles partner invite',
          public.first_name(v_c.created_by) || ' wants you as their partner at ' || coalesce(v_court, 'a court'),
          jsonb_build_object('path', '/challenges')
        );
      end if;
    elsif not v_new then
      update public.challenge_players set side = r.side
      where challenge_id = p_challenge and profile_id = r.pid and side <> r.side;
      if p_reset_all and v_pending then
        update public.challenge_players set response = 'pending', responded_at = null
        where challenge_id = p_challenge and profile_id = r.pid;
        perform public.notify(
          r.pid, 'challenges', 'The game changed',
          public.first_name(v_c.created_by) || ' changed the game. Check the details and tap OK again.',
          jsonb_build_object('path', '/challenges')
        );
      end if;
    end if;
  end loop;
end;
$$;

-- The game is on when everyone has said OK and there is nobody left to find.
-- Anyone who can't make it sends it back to declined, and an edit can fix that.
create function public.challenge_refresh_status(p_challenge uuid)
returns public.challenge_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.challenges;
  v_status public.challenge_status;
begin
  select * into v_c from public.challenges where id = p_challenge for update;
  if v_c.id is null then return null; end if;
  if v_c.status in ('cancelled', 'completed') or exists (select 1 from public.matches where challenge_id = p_challenge) then
    return v_c.status;
  end if;
  if exists (select 1 from public.challenge_players where challenge_id = p_challenge and response = 'out') then
    v_status := 'declined';
  elsif v_c.challenged_team_id is null or v_c.needs_partner
        or exists (select 1 from public.challenge_players where challenge_id = p_challenge and response = 'pending') then
    v_status := 'pending';
  else
    v_status := 'accepted';
  end if;
  if v_status is distinct from v_c.status then
    update public.challenges set status = v_status, updated_at = now() where id = p_challenge;
  end if;
  return v_status;
end;
$$;

-- Checks who is playing and works out the two teams. A missing partner or
-- opponent is an open spot.
create function public.challenge_resolve(
  p_kind text, p_partner uuid, p_opp1 uuid, p_opp2 uuid, p_court uuid, p_time timestamptz, p_best_of smallint, p_check_time boolean default true
)
returns table (my_team uuid, their_team uuid, ch_needs boolean, opp_needs boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_opp1 uuid := p_opp1;
  v_opp2 uuid := p_opp2;
  x uuid;
  v_from text;
begin
  if v_me is null then raise exception 'Not signed in'; end if;
  if p_kind is null or p_kind not in ('singles', 'doubles') then raise exception 'Pick singles or doubles'; end if;
  if p_best_of is null or p_best_of not in (1, 3) then raise exception 'Pick one game or best of 3'; end if;
  if p_kind = 'singles' and (p_partner is not null or p_opp2 is not null) then
    raise exception 'Singles is one player against one player';
  end if;
  if v_opp1 is null and v_opp2 is not null then v_opp1 := v_opp2; v_opp2 := null; end if;

  if v_me = any (array[p_partner, v_opp1, v_opp2]) then raise exception 'You are already in the game'; end if;
  if (select count(distinct y) <> count(y) from unnest(array[p_partner, v_opp1, v_opp2]) as y) then
    raise exception 'Each spot needs a different player';
  end if;

  foreach x in array array[p_partner, v_opp1, v_opp2] loop
    if x is not null then
      if not public.person_ok(v_me, x) or public.test_hidden(x) then raise exception 'That player is not available'; end if;
      select challenges_from into v_from from public.profiles where id = x and not is_placeholder;
      if v_from = 'friends' and not public.are_friends(v_me, x) then
        raise exception '% only takes challenges from friends', public.first_name(x);
      end if;
    end if;
  end loop;
  if exists (select 1 from public.profiles where id in (coalesce(v_opp1, v_me), coalesce(v_opp2, v_me)) and is_placeholder) then
    raise exception 'Opponents have to be players on Sickle';
  end if;

  if not exists (select 1 from public.courts where id = p_court and status = 'approved') then
    raise exception 'Pick an approved court';
  end if;
  if p_check_time and (p_time is null or p_time < now()) then raise exception 'Pick a time in the future'; end if;

  if p_kind = 'doubles' and p_partner is not null then
    my_team := public.ensure_team(v_me, p_partner);
  else
    my_team := public.ensure_team(v_me, null);
  end if;
  ch_needs := p_kind = 'doubles' and p_partner is null;

  opp_needs := false;
  if v_opp1 is null then
    their_team := null;
  elsif p_kind = 'singles' then
    their_team := public.ensure_team(v_opp1, null);
  elsif v_opp2 is not null then
    their_team := public.ensure_team(v_opp1, v_opp2);
  else
    their_team := public.ensure_team(v_opp1, null);
    opp_needs := true;
  end if;
  if their_team is not null and public.teams_blocked(my_team, their_team) then
    raise exception 'You cannot challenge this team';
  end if;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sending, changing and answering a challenge
-- ---------------------------------------------------------------------------

-- Every new challenge gets its player rows (and the "you were challenged"
-- alerts) from here now, however it was sent.
create or replace function public.notify_on_challenge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.logged then
    perform public.challenge_sync_players(new.id, false);
  end if;
  return new;
end;
$$;

-- When the game is on, everyone else in it hears about it.
create or replace function public.notify_on_challenge_answer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p uuid;
  v_court text;
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    select name into v_court from public.courts where id = new.court_id;
    for p in
      select cp.profile_id from public.challenge_players cp
      join public.profiles pr on pr.id = cp.profile_id
      where cp.challenge_id = new.id and not pr.is_placeholder and cp.profile_id is distinct from auth.uid() and cp.profile_id is distinct from new.created_by
    loop
      perform public.notify(
        p, 'challenges', 'Game is on',
        public.team_display_name(new.challenger_team_id) || ' vs ' || coalesce(public.team_display_name(new.challenged_team_id), 'TBD') || ' at ' || coalesce(v_court, 'a court'),
        jsonb_build_object('path', '/challenges')
      );
    end loop;
  end if;
  return new;
end;
$$;

-- kind is singles or doubles. A null partner or opponent is an open spot you fill in later.
create function public.create_game_challenge(
  p_kind text, p_partner uuid, p_opp1 uuid, p_opp2 uuid, p_court uuid, p_time timestamptz, p_best_of smallint default 3
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_r record;
  v_id uuid;
begin
  select * into v_r from public.challenge_resolve(p_kind, p_partner, p_opp1, p_opp2, p_court, p_time, p_best_of, true);
  insert into public.challenges (challenger_team_id, challenged_team_id, court_id, proposed_time, created_by, best_of, needs_partner, challenger_needs_partner)
  values (v_r.my_team, v_r.their_team, p_court, p_time, v_me, p_best_of, v_r.opp_needs, v_r.ch_needs)
  returning id into v_id;
  perform public.challenge_refresh_status(v_id);
  return v_id;
end;
$$;

-- Change who, when, where or how long. Only the player who sent it can.
-- A new time, court or length sends everyone back to waiting. Swapping a
-- player only asks the new player.
create function public.edit_challenge(
  p_challenge uuid, p_kind text, p_partner uuid, p_opp1 uuid, p_opp2 uuid, p_court uuid, p_time timestamptz, p_best_of smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_c public.challenges;
  v_r record;
  v_reset boolean;
begin
  select * into v_c from public.challenges where id = p_challenge for update;
  if v_c.id is null then raise exception 'Unknown challenge'; end if;
  if v_c.created_by is distinct from v_me then raise exception 'Only the player who sent it can change it'; end if;
  if v_c.logged or v_c.status in ('cancelled', 'completed') or exists (select 1 from public.matches where challenge_id = p_challenge) then
    raise exception 'This challenge is closed';
  end if;

  select * into v_r from public.challenge_resolve(p_kind, p_partner, p_opp1, p_opp2, p_court, p_time, p_best_of, p_time is distinct from v_c.proposed_time);
  v_reset := p_court <> v_c.court_id or p_time is distinct from v_c.proposed_time or p_best_of <> v_c.best_of;

  update public.challenges
  set challenger_team_id = v_r.my_team,
      challenged_team_id = v_r.their_team,
      court_id = p_court,
      proposed_time = p_time,
      best_of = p_best_of,
      needs_partner = v_r.opp_needs,
      challenger_needs_partner = v_r.ch_needs,
      status = case when v_r.opp_needs or v_r.their_team is null then 'pending'::public.challenge_status else status end,
      is_test = exists (
        select 1 from public.teams t join public.profiles p on p.id in (t.player_low, t.player_high)
        where t.id in (v_r.my_team, v_r.their_team) and p.is_test
      ),
      updated_at = now()
  where id = p_challenge;

  perform public.challenge_sync_players(p_challenge, v_reset);
  perform public.challenge_refresh_status(p_challenge);
end;
$$;

-- Say OK or "can't make it" for your own spot. Older versions of the app can
-- still pass one of their own doubles teams to play with instead; the other
-- player on that team then has to say OK too.
create or replace function public.respond_to_challenge(p_challenge uuid, p_accept boolean, p_team uuid default null)
returns public.challenge_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_c public.challenges;
  v_new public.teams;
  v_ch public.teams;
  v_status public.challenge_status;
begin
  select * into v_c from public.challenges where id = p_challenge for update;
  if v_c.id is null then raise exception 'Unknown challenge'; end if;
  if v_c.status in ('cancelled', 'completed') or exists (select 1 from public.matches where challenge_id = p_challenge) then
    raise exception 'This challenge is already %', v_c.status;
  end if;
  if not exists (select 1 from public.challenge_players where challenge_id = p_challenge and profile_id = v_me) then
    raise exception 'You are not in this challenge';
  end if;
  if v_c.created_by = v_me then raise exception 'You sent this challenge, so you are already in. Cancel it to call it off'; end if;

  if p_accept and p_team is not null and p_team is distinct from v_c.challenged_team_id and v_c.challenged_team_id is not null then
    select * into v_new from public.teams where id = p_team;
    select * into v_ch from public.teams where id = v_c.challenger_team_id;
    if v_new.id is null or v_new.deleted_at is not null or v_me not in (v_new.player_low, v_new.player_high) then
      raise exception 'Pick one of your own teams';
    end if;
    if v_new.player_high is null or v_ch.player_high is null then
      raise exception 'Only doubles challenges can switch teams';
    end if;
    if v_new.player_low in (v_ch.player_low, v_ch.player_high) or v_new.player_high in (v_ch.player_low, v_ch.player_high) then
      raise exception 'A player cannot be on both teams';
    end if;
    if public.teams_blocked(p_team, v_c.challenger_team_id) then raise exception 'You cannot play this team'; end if;
    update public.challenges set challenged_team_id = p_team, updated_at = now() where id = p_challenge;
    perform public.challenge_sync_players(p_challenge, false);
  end if;

  update public.challenge_players
  set response = case when p_accept then 'in' else 'out' end, responded_at = now()
  where challenge_id = p_challenge and profile_id = v_me;

  v_status := public.challenge_refresh_status(p_challenge);
  if v_c.created_by is distinct from v_me then
    perform public.notify(
      v_c.created_by, 'challenges',
      case when p_accept then 'Challenge accepted' else 'Challenge declined' end,
      public.first_name(v_me) || case when p_accept then ' is in.' else ' can''t make it. You can change the players or the time.' end
        || case when v_status = 'accepted' then ' Everyone is in, so the game is on.' else '' end,
      jsonb_build_object('path', '/challenges')
    );
  end if;
  return v_status;
end;
$$;

-- Accept a challenge where you pick your own partner. Your partner gets their own OK.
create or replace function public.accept_challenge_with_partner(p_challenge uuid, p_partner uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_c public.challenges;
  v_ch public.teams;
  v_team uuid;
begin
  select * into v_c from public.challenges where id = p_challenge for update;
  if v_c.id is null then raise exception 'Unknown challenge'; end if;
  if v_c.status not in ('pending', 'declined') then raise exception 'This challenge is already %', v_c.status; end if;
  if not v_c.needs_partner then raise exception 'This challenge already has a team'; end if;
  if not public.is_team_member(v_c.challenged_team_id, v_me) then raise exception 'Only the challenged player can respond'; end if;
  if p_partner is null or p_partner = v_me then raise exception 'Pick a partner'; end if;
  if not public.person_ok(v_me, p_partner) or public.test_hidden(p_partner) then
    raise exception 'Your partner has to be a player or someone you created';
  end if;
  select * into v_ch from public.teams where id = v_c.challenger_team_id;
  if p_partner in (v_ch.player_low, v_ch.player_high) then raise exception 'A player cannot be on both teams'; end if;

  v_team := public.ensure_team(v_me, p_partner);
  if public.teams_blocked(v_team, v_c.challenger_team_id) then raise exception 'You cannot play this team'; end if;

  update public.challenges
  set challenged_team_id = v_team, needs_partner = false, updated_at = now()
  where id = p_challenge;
  perform public.challenge_sync_players(p_challenge, false);
  update public.challenge_players set response = 'in', responded_at = now() where challenge_id = p_challenge and profile_id = v_me;
  perform public.challenge_refresh_status(p_challenge);
  return v_team;
end;
$$;

-- Naming your own partner after the game, as before. They don't need to OK it.
create or replace function public.set_challenge_partner(p_challenge uuid, p_partner uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_c public.challenges;
  v_other public.teams;
  v_team uuid;
begin
  select * into v_c from public.challenges where id = p_challenge for update;
  if v_c.id is null then raise exception 'Unknown challenge'; end if;
  if not v_c.challenger_needs_partner then raise exception 'This challenge already has your team'; end if;
  if v_c.status not in ('pending', 'accepted') or exists (select 1 from public.matches where challenge_id = p_challenge) then
    raise exception 'This challenge is closed';
  end if;
  if not public.is_team_member(v_c.challenger_team_id, v_me) then raise exception 'Only the player who sent it can do this'; end if;
  if p_partner is null or p_partner = v_me then raise exception 'Pick a partner'; end if;
  if not public.person_ok(v_me, p_partner) then raise exception 'Your partner has to be a real player or someone you added'; end if;
  select * into v_other from public.teams where id = v_c.challenged_team_id;
  if p_partner in (v_other.player_low, v_other.player_high) then raise exception 'A player cannot be on both teams'; end if;

  v_team := public.ensure_team(v_me, p_partner);
  if v_c.challenged_team_id is not null and public.teams_blocked(v_team, v_c.challenged_team_id) then
    raise exception 'You cannot play this team';
  end if;
  update public.challenges
  set challenger_team_id = v_team, challenger_needs_partner = false, updated_at = now()
  where id = p_challenge;
  perform public.challenge_sync_players(p_challenge, false);
  update public.challenge_players set response = 'in', responded_at = now() where challenge_id = p_challenge and profile_id = p_partner;
  return v_team;
end;
$$;

-- ---------------------------------------------------------------------------
-- my_challenges: who is in, and who has said OK
-- ---------------------------------------------------------------------------
drop function public.my_challenges();

create function public.my_challenges()
returns table (
  challenge_id uuid, status public.challenge_status, i_challenged boolean, my_team_id uuid, my_team_name text,
  their_team_id uuid, their_team_name text, court_id uuid, court_name text, proposed_time timestamptz,
  created_at timestamptz, match_id uuid, match_status public.match_status, awaiting_me boolean, i_won boolean,
  games jsonb, submitted_by_name text, played_at timestamptz, best_of smallint, needs_partner boolean, logged boolean,
  challenger_needs_partner boolean, is_test boolean,
  i_created boolean, my_response text, players jsonb, open_opponent boolean, can_edit boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select c.*,
           public.is_team_member(c.challenger_team_id, auth.uid()) as i_challenged
    from public.challenges c
    where (public.is_team_member(c.challenger_team_id, auth.uid())
        or public.is_team_member(c.challenged_team_id, auth.uid()))
      and not exists (select 1 from public.matches mm where mm.challenge_id = c.id and mm.deleted_at is not null)
  )
  select c.id, c.status, c.i_challenged,
         case when c.i_challenged then c.challenger_team_id else c.challenged_team_id end,
         coalesce(public.team_display_name(case when c.i_challenged then c.challenger_team_id else c.challenged_team_id end), 'Open spot')
           || case when c.i_challenged and c.challenger_needs_partner then ' + partner TBD' else '' end,
         case when c.i_challenged then c.challenged_team_id else c.challenger_team_id end,
         coalesce(public.team_display_name(case when c.i_challenged then c.challenged_team_id else c.challenger_team_id end), 'Open spot')
           || case when (c.i_challenged and c.needs_partner) or (not c.i_challenged and c.challenger_needs_partner) then ' + partner TBD' else '' end,
         c.court_id, co.name, c.proposed_time, c.created_at,
         m.id, m.status,
         coalesce(m.awaiting_team_id = case when c.i_challenged then c.challenger_team_id else c.challenged_team_id end, false),
         m.winner_team_id = case when c.i_challenged then c.challenger_team_id else c.challenged_team_id end,
         (select jsonb_agg(case when c.i_challenged then jsonb_build_array(g.team_a_score, g.team_b_score)
                                else jsonb_build_array(g.team_b_score, g.team_a_score) end order by g.game_number)
          from public.games g where g.match_id = m.id),
         sp.display_name,
         m.played_at,
         c.best_of,
         c.needs_partner,
         c.logged,
         c.challenger_needs_partner,
         c.is_test,
         c.created_by = auth.uid(),
         (select cp.response from public.challenge_players cp where cp.challenge_id = c.id and cp.profile_id = auth.uid()),
         (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', cp.profile_id, 'name', p.display_name,
                    'mine', cp.side = case when c.i_challenged then 'a' else 'b' end,
                    'response', cp.response, 'creator', cp.profile_id = c.created_by, 'placeholder', p.is_placeholder
                  ) order by cp.side, (cp.profile_id = c.created_by) desc, p.display_name), '[]'::jsonb)
          from public.challenge_players cp join public.profiles p on p.id = cp.profile_id
          where cp.challenge_id = c.id),
         c.challenged_team_id is null,
         c.created_by = auth.uid() and c.status in ('pending', 'accepted', 'declined') and not c.logged and m.id is null
  from mine c
  join public.courts co on co.id = c.court_id
  left join public.matches m on m.challenge_id = c.id
  left join public.profiles sp on sp.id = m.submitted_by
  order by coalesce(m.played_at, c.proposed_time) desc;
$$;

-- ---------------------------------------------------------------------------
-- Friends and opponents on a profile
-- ---------------------------------------------------------------------------

-- Someone's friends. "mutual" means they are also your friend.
create function public.player_friends(p_profile uuid)
returns table (profile_id uuid, display_name text, username text, avatar_url text, mutual boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.username::text, p.avatar_url,
         p.id <> auth.uid() and public.are_friends(auth.uid(), p.id)
  from public.friendships f
  join public.profiles p on p.id = case when f.requester_id = p_profile then f.addressee_id else f.requester_id end
  where f.status = 'accepted'
    and p_profile in (f.requester_id, f.addressee_id)
    and p.deleted_at is null and not p.is_placeholder
    and not public.test_hidden(p.id)
    and not public.players_blocked(auth.uid(), p.id)
    and not public.players_blocked(auth.uid(), p_profile)
  order by (p.id <> auth.uid() and public.are_friends(auth.uid(), p.id)) desc, p.display_name;
$$;

-- How many friends someone has, and how many of them you share.
create function public.friend_counts(p_profile uuid)
returns table (friends integer, mutual integer)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer,
         (count(*) filter (where p_profile <> auth.uid() and p.id <> auth.uid() and public.are_friends(auth.uid(), p.id)))::integer
  from public.friendships f
  join public.profiles p on p.id = case when f.requester_id = p_profile then f.addressee_id else f.requester_id end
  where f.status = 'accepted'
    and p_profile in (f.requester_id, f.addressee_id)
    and p.deleted_at is null and not p.is_placeholder
    and not public.test_hidden(p.id)
    and not public.players_blocked(auth.uid(), p.id)
    and not public.players_blocked(auth.uid(), p_profile);
$$;

-- Who someone has played against, with their record against each person.
-- Nothing comes back if they keep their record private.
create function public.player_opponents(p_profile uuid)
returns table (profile_id uuid, display_name text, username text, avatar_url text, placeholder boolean, wins integer, losses integer, last_played timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with games as (
    select m.played_at,
           case when t.id = m.team_a_id then m.team_b_id else m.team_a_id end as other_team,
           (m.winner_team_id = t.id) as won
    from public.teams t
    join public.matches m on m.status = 'confirmed' and m.deleted_at is null
                          and (not m.is_test or public.is_test_user())
                          and t.id in (m.team_a_id, m.team_b_id)
    where p_profile in (t.player_low, t.player_high)
  )
  select p.id, p.display_name, p.username::text, p.avatar_url, p.is_placeholder,
         (count(*) filter (where g.won))::integer, (count(*) filter (where not g.won))::integer, max(g.played_at)
  from games g
  join public.teams ot on ot.id = g.other_team
  cross join lateral unnest(array[ot.player_low, ot.player_high]) as x
  join public.profiles p on p.id = x
  where x is not null
    and p.deleted_at is null
    and p.id <> p_profile
    and (p_profile = auth.uid() or exists (select 1 from public.profiles pr where pr.id = p_profile and pr.show_record))
    and not public.players_blocked(auth.uid(), p_profile)
    and not public.players_blocked(auth.uid(), p.id)
    and not public.test_hidden(p.id)
    and (not p.is_placeholder or (p_profile = auth.uid() and p.owner_id = auth.uid()))
  group by p.id, p.display_name, p.username, p.avatar_url, p.is_placeholder
  order by max(g.played_at) desc;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function
  public.challenge_sync_players(uuid, boolean),
  public.challenge_refresh_status(uuid),
  public.challenge_resolve(text, uuid, uuid, uuid, uuid, timestamptz, smallint, boolean),
  public.create_game_challenge(text, uuid, uuid, uuid, uuid, timestamptz, smallint),
  public.edit_challenge(uuid, text, uuid, uuid, uuid, uuid, timestamptz, smallint),
  public.my_challenges(),
  public.player_friends(uuid), public.friend_counts(uuid), public.player_opponents(uuid)
from public, anon, authenticated;

grant execute on function
  public.create_game_challenge(text, uuid, uuid, uuid, uuid, timestamptz, smallint),
  public.edit_challenge(uuid, text, uuid, uuid, uuid, uuid, timestamptz, smallint),
  public.my_challenges(),
  public.player_friends(uuid), public.friend_counts(uuid), public.player_opponents(uuid)
to authenticated;

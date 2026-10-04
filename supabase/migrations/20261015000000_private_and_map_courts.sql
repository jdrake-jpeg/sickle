-- Courts: add one straight from a map pin, save a private court for your
-- friends, and pick the court a match was really played at.
--
-- Additive. Older builds keep working: the same courts show up for them, and
-- submit_match_result still works with its old arguments.

alter table public.courts
  add column is_private boolean not null default false,
  -- manual: typed in by a player. map: added from a pickleball court mapped
  -- on Google or OpenStreetMap.
  add column source text not null default 'manual' check (source in ('manual', 'map'));

-- ---------------------------------------------------------------------------
-- Who can see a court
-- ---------------------------------------------------------------------------
-- Public courts: approved ones for everyone (pending ones for the player who
-- submitted them and admins). Private courts: only the player who saved it
-- and their friends. Admins don't get to see private courts.

drop policy "courts readable" on public.courts;
create policy "courts readable" on public.courts for select to authenticated
  using (
    submitted_by = auth.uid()
    or (is_private and status = 'approved' and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester_id = submitted_by and f.addressee_id = auth.uid()) or (f.requester_id = auth.uid() and f.addressee_id = submitted_by))
    ))
    or (not is_private and (status = 'approved' or public.is_admin()))
  );

-- ---------------------------------------------------------------------------
-- Submitting a public court no longer collides with someone's private court
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

  insert into public.courts (name, lat, lng, address, court_count, indoor, status, submitted_by, submission_note,
                             google_place_id, reviewed_by, reviewed_at)
  values (v_name, p_lat, p_lng, nullif(btrim(p_address), ''), p_court_count, coalesce(p_indoor, false),
          case when v_admin then 'approved'::public.court_status else 'pending'::public.court_status end,
          v_me, nullif(btrim(p_note), ''), v_place,
          case when v_admin then v_me end, case when v_admin then now() end)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- A court from a map pin, added right away (no admin review)
-- ---------------------------------------------------------------------------
-- Pickleball courts that already show on the map can go straight into Sickle.
-- If it's already here, you get the existing court back. Admins can still
-- edit or remove it. A player can add 10 a day.

create function public.add_map_court(
  p_name text,
  p_lat double precision,
  p_lng double precision,
  p_address text default null,
  p_place_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_name text := coalesce(nullif(left(btrim(coalesce(p_name, '')), 60), ''), 'Pickleball courts');
  v_place text := nullif(btrim(p_place_id), '');
  v_existing uuid;
  v_id uuid;
begin
  if v_me is null or not exists (select 1 from public.profiles where id = v_me) then
    raise exception 'Finish setting up your profile first';
  end if;
  if char_length(v_name) < 2 then v_name := 'Pickleball courts'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'That court has no location';
  end if;
  if v_place is null then raise exception 'Only courts from the map can be added this way'; end if;

  -- Already on Sickle (same place, or about 100 meters away)? Use that one.
  select c.id into v_existing
  from public.courts c
  where c.status = 'approved' and not c.is_private
    and ((c.google_place_id = v_place) or public.distance_miles(c.lat, c.lng, p_lat, p_lng) < 0.06)
  order by public.distance_miles(c.lat, c.lng, p_lat, p_lng)
  limit 1;
  if v_existing is not null then return v_existing; end if;

  if exists (
    select 1 from public.courts c
    where c.status = 'pending' and not c.is_private
      and ((c.google_place_id = v_place) or public.distance_miles(c.lat, c.lng, p_lat, p_lng) < 0.06)
  ) then
    raise exception 'That court is waiting for an admin to review it';
  end if;

  if (select count(*) from public.courts where submitted_by = v_me and source = 'map' and created_at > now() - interval '1 day') >= 10 then
    raise exception 'You added a lot of courts today. Try again tomorrow';
  end if;

  update public.courts set google_place_id = null where google_place_id = v_place and status = 'rejected';

  insert into public.courts (name, lat, lng, address, status, source, submitted_by, google_place_id, reviewed_at)
  values (v_name, p_lat, p_lng, nullif(left(btrim(coalesce(p_address, '')), 200), ''), 'approved', 'map', v_me, v_place, now())
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Private courts (you and your friends only)
-- ---------------------------------------------------------------------------
-- Saved right away, never sent to an admin, never on a public map or
-- leaderboard crown. Not allowed where a public court already is.

create function public.create_private_court(
  p_name text,
  p_lat double precision,
  p_lng double precision,
  p_address text default null,
  p_court_count integer default null,
  p_indoor boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_public text;
  v_id uuid;
begin
  if v_me is null or not exists (select 1 from public.profiles where id = v_me) then
    raise exception 'Finish setting up your profile first';
  end if;
  if char_length(v_name) not between 2 and 60 then raise exception 'Give the court a name (2 to 60 characters)'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Drop a pin on the court';
  end if;
  if p_court_count is not null and p_court_count not between 1 and 50 then
    raise exception 'Number of courts should be between 1 and 50';
  end if;

  select c.name into v_public
  from public.courts c
  where not c.is_private and c.status in ('approved', 'pending')
    and public.distance_miles(c.lat, c.lng, p_lat, p_lng) < 0.1
  order by public.distance_miles(c.lat, c.lng, p_lat, p_lng)
  limit 1;
  if v_public is not null then
    raise exception 'A public court is already there (%). Use it instead of making a private one', v_public;
  end if;

  if (select count(*) from public.courts where submitted_by = v_me and is_private) >= 10 then
    raise exception 'You have 10 private courts. Remove one first';
  end if;

  insert into public.courts (name, lat, lng, address, court_count, indoor, status, is_private, submitted_by, reviewed_at)
  values (v_name, p_lat, p_lng, nullif(left(btrim(coalesce(p_address, '')), 200), ''), p_court_count, coalesce(p_indoor, false),
          'approved', true, v_me, now())
  returning id into v_id;
  return v_id;
end;
$$;

-- The player who saved a private court can remove it. Played matches keep the
-- court hidden instead, so history stays.
create function public.remove_private_court(p_court uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.courts where id = p_court and is_private and submitted_by = auth.uid()) then
    raise exception 'That is not your private court';
  end if;
  if exists (select 1 from public.challenges where court_id = p_court) or exists (select 1 from public.matches where court_id = p_court) then
    update public.courts set status = 'rejected', reviewed_at = now() where id = p_court;
    update public.challenges set status = 'cancelled', updated_at = now()
    where court_id = p_court and status in ('pending', 'accepted')
      and not exists (select 1 from public.matches m where m.challenge_id = challenges.id);
    return 'hidden';
  end if;
  delete from public.courts where id = p_court;
  return 'deleted';
end;
$$;

-- Games at a private court are only for friends of the player who saved it.
create function public.check_court_players(p_court uuid, p_team_a uuid, p_team_b uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.courts;
begin
  select * into v_c from public.courts where id = p_court;
  if v_c.id is null or not v_c.is_private then return; end if;
  if exists (
    select 1
    from public.teams t
    cross join lateral unnest(array[t.player_low, t.player_high]) as p(id)
    where t.id in (p_team_a, p_team_b) and p.id is not null
      and p.id <> v_c.submitted_by and not public.are_friends(v_c.submitted_by, p.id)
  ) then
    raise exception 'That is a private court. Everyone playing has to be friends with the player who saved it';
  end if;
end;
$$;

create function public.challenges_check_private_court()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.check_court_players(new.court_id, new.challenger_team_id, new.challenged_team_id);
  return new;
end;
$$;

create trigger challenges_check_private_court
before insert on public.challenges
for each row execute function public.challenges_check_private_court();

-- Crowns are only for public courts.
create or replace function public.court_champion(p_court uuid, p_singles boolean)
returns table (team_id uuid, team_name text, wins integer)
language sql
stable
security definer
set search_path = ''
as $$
  select l.team_id, l.team_name, l.wins
  from public.court_leaderboard(p_court, p_singles) l
  where l.rank = 1 and l.wins >= 6
    and exists (select 1 from public.courts c where c.id = p_court and c.status = 'approved' and not c.is_private);
$$;

-- ---------------------------------------------------------------------------
-- Pick where you really played when you enter the score
-- ---------------------------------------------------------------------------

drop function public.submit_match_result(uuid, jsonb, timestamptz);

create function public.submit_match_result(
  p_challenge uuid, p_games jsonb, p_played_at timestamptz default now(), p_court uuid default null
)
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
  v_court uuid;
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

  v_winner := public.match_winner(p_games, v_c.best_of);

  -- Played somewhere other than where it was planned? The court is fixed
  -- here, and the other team sees it when they confirm.
  v_court := coalesce(p_court, v_c.court_id);
  if v_court <> v_c.court_id then
    if not exists (select 1 from public.courts where id = v_court and status = 'approved') then
      raise exception 'Pick an approved court';
    end if;
    perform public.check_court_players(v_court, v_c.challenger_team_id, v_c.challenged_team_id);
    update public.challenges set court_id = v_court, updated_at = now() where id = p_challenge;
  end if;

  insert into public.matches (challenge_id, team_a_id, team_b_id, court_id, played_at, awaiting_team_id, winner_team_id, submitted_by)
  values (
    p_challenge, v_c.challenger_team_id, v_c.challenged_team_id, v_court, p_played_at, v_other_team,
    case when v_winner = 'a' then v_c.challenger_team_id else v_c.challenged_team_id end, v_me
  )
  returning id into v_match;

  perform public.replace_games(v_match, p_games);
  insert into public.score_proposals (match_id, round, team_id, profile_id, scores)
  values (v_match, 0, v_my_team, v_me, p_games);

  return v_match;
end;
$$;

revoke execute on function
  public.add_map_court(text, double precision, double precision, text, text),
  public.create_private_court(text, double precision, double precision, text, integer, boolean),
  public.remove_private_court(uuid),
  public.check_court_players(uuid, uuid, uuid),
  public.challenges_check_private_court(),
  public.court_champion(uuid, boolean),
  public.submit_court(text, double precision, double precision, text, integer, boolean, text, text),
  public.submit_match_result(uuid, jsonb, timestamptz, uuid)
from public, anon, authenticated;
grant execute on function
  public.add_map_court(text, double precision, double precision, text, text),
  public.create_private_court(text, double precision, double precision, text, integer, boolean),
  public.remove_private_court(uuid),
  public.court_champion(uuid, boolean),
  public.submit_court(text, double precision, double precision, text, integer, boolean, text, text),
  public.submit_match_result(uuid, jsonb, timestamptz, uuid)
to authenticated;

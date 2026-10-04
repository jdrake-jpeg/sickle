-- Round 2: teams only with friends, players listed under team names, 3 courts
-- a day, and private courts not within 200 feet of a public court.
-- Additive: older builds keep working.

-- ---------------------------------------------------------------------------
-- Teams only with friends
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

  insert into public.teams (player_low, player_high, name, created_by)
  values (least(v_me, p_partner), greatest(v_me, p_partner), nullif(trim(p_name), ''), v_me)
  on conflict (player_low, player_high) do update
    set name = case when public.teams.deleted_at is not null then excluded.name else coalesce(excluded.name, public.teams.name) end,
        deleted_at = null
  returning id into v_team;

  return v_team;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who is on a team: "Jack Thompson and Tyler Kim"
-- ---------------------------------------------------------------------------

create function public.team_players(p_teams uuid[])
returns table (team_id uuid, players text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id,
         (select string_agg(p.display_name, ' and ' order by p.display_name) from public.profiles p where p.id in (t.player_low, t.player_high))
  from public.teams t
  where t.id = any (p_teams);
$$;

-- ---------------------------------------------------------------------------
-- 3 courts a day
-- ---------------------------------------------------------------------------

create function public.courts_added_today(p_user uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.courts where submitted_by = p_user and created_at > now() - interval '1 day';
$$;

-- Public court submissions count toward the limit too.
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

-- A court from a map pin.
create or replace function public.add_map_court(
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

  if not public.is_admin() and public.courts_added_today(v_me) >= 3 then
    raise exception 'You can add 3 courts a day. Try again tomorrow';
  end if;

  update public.courts set google_place_id = null where google_place_id = v_place and status = 'rejected';

  insert into public.courts (name, lat, lng, address, status, source, submitted_by, google_place_id, reviewed_at)
  values (v_name, p_lat, p_lng, nullif(left(btrim(coalesce(p_address, '')), 200), ''), 'approved', 'map', v_me, v_place, now())
  returning id into v_id;
  return v_id;
end;
$$;

-- A private court: not within 200 feet of a public court.
create or replace function public.create_private_court(
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
    and public.distance_miles(c.lat, c.lng, p_lat, p_lng) < 0.0379
  order by public.distance_miles(c.lat, c.lng, p_lat, p_lng)
  limit 1;
  if v_public is not null then
    raise exception 'A public court is already there (%). Private courts can''t be within 200 feet of a public court. Use the public one', v_public;
  end if;

  if not public.is_admin() and public.courts_added_today(v_me) >= 3 then
    raise exception 'You can add 3 courts a day. Try again tomorrow';
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

revoke execute on function
  public.create_team(uuid, text),
  public.team_players(uuid[]),
  public.courts_added_today(uuid),
  public.submit_court(text, double precision, double precision, text, integer, boolean, text, text),
  public.add_map_court(text, double precision, double precision, text, text),
  public.create_private_court(text, double precision, double precision, text, integer, boolean)
from public, anon, authenticated;
grant execute on function
  public.create_team(uuid, text),
  public.team_players(uuid[]),
  public.submit_court(text, double precision, double precision, text, integer, boolean, text, text),
  public.add_map_court(text, double precision, double precision, text, text),
  public.create_private_court(text, double precision, double precision, text, integer, boolean)
to authenticated;

-- Round 6: preferred playing times, and courts added in bulk.
-- Additive. Older builds keep working.

-- ---------------------------------------------------------------------------
-- Preferred times: days of the week and one 2 hour window (start in minutes
-- after midnight). Anyone signed in can read them, like the rest of a profile.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column preferred_days smallint[] not null default '{}'
    check (preferred_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[] and cardinality(preferred_days) <= 7),
  add column preferred_start smallint check (preferred_start between 0 and 1320);

grant update (preferred_days, preferred_start) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Courts near you, added automatically.
-- ---------------------------------------------------------------------------

-- The app finds mapped pickleball courts within 5 miles of a player and adds
-- the ones Sickle doesn't have yet. Same rules as add_map_court (a court that
-- is already within about 100 meters is skipped), but in one call, and with its
-- own daily limit so it never uses up the 3 courts a player can add by hand.
create or replace function public.add_nearby_map_courts(p_spots jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_spot jsonb;
  v_name text;
  v_lat double precision;
  v_lng double precision;
  v_place text;
  v_added integer := 0;
  v_today integer;
begin
  if v_me is null or not exists (select 1 from public.profiles where id = v_me) then
    raise exception 'Finish setting up your profile first';
  end if;
  if jsonb_typeof(p_spots) <> 'array' then raise exception 'Send a list of courts'; end if;
  if jsonb_array_length(p_spots) > 25 then raise exception 'Too many courts at once'; end if;

  select count(*) into v_today
  from public.courts
  where submitted_by = v_me and source = 'map' and created_at > now() - interval '1 day';
  if v_today >= 60 then return 0; end if;

  for v_spot in select * from jsonb_array_elements(p_spots) loop
    exit when v_today + v_added >= 60;
    v_lat := (v_spot ->> 'lat')::double precision;
    v_lng := (v_spot ->> 'lng')::double precision;
    v_place := nullif(btrim(v_spot ->> 'place_id'), '');
    v_name := coalesce(nullif(left(btrim(coalesce(v_spot ->> 'name', '')), 60), ''), 'Pickleball courts');
    if char_length(v_name) < 2 then v_name := 'Pickleball courts'; end if;
    continue when v_place is null or v_lat is null or v_lng is null
      or v_lat not between -90 and 90 or v_lng not between -180 and 180;

    continue when exists (
      select 1 from public.courts c
      where c.status in ('approved', 'pending') and not c.is_private
        and (c.google_place_id = v_place or public.distance_miles(c.lat, c.lng, v_lat, v_lng) < 0.06)
    );

    update public.courts set google_place_id = null where google_place_id = v_place and status = 'rejected';

    insert into public.courts (name, lat, lng, address, status, source, submitted_by, google_place_id, reviewed_at)
    values (v_name, v_lat, v_lng, nullif(left(btrim(coalesce(v_spot ->> 'address', '')), 200), ''), 'approved', 'map', v_me, v_place, now());
    v_added := v_added + 1;
  end loop;
  return v_added;
end;
$$;

-- For the one time Utah and Idaho seed, run from the SQL Editor. Not callable
-- from the app. Each spot: n name, a address, la lat, lo lng, p place id,
-- c number of courts (optional).
create or replace function public.seed_map_courts(p_spots jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_spot jsonb;
  v_lat double precision;
  v_lng double precision;
  v_place text;
  v_name text;
  v_count integer;
  v_added integer := 0;
begin
  for v_spot in select * from jsonb_array_elements(p_spots) loop
    v_lat := (v_spot ->> 'la')::double precision;
    v_lng := (v_spot ->> 'lo')::double precision;
    v_place := nullif(btrim(v_spot ->> 'p'), '');
    v_name := coalesce(nullif(left(btrim(coalesce(v_spot ->> 'n', '')), 60), ''), 'Pickleball courts');
    v_count := nullif(v_spot ->> 'c', '')::integer;
    continue when v_place is null or v_lat is null or v_lng is null
      or v_lat not between -90 and 90 or v_lng not between -180 and 180;

    continue when exists (
      select 1 from public.courts c
      where not c.is_private
        and (c.google_place_id = v_place or (c.status in ('approved', 'pending') and public.distance_miles(c.lat, c.lng, v_lat, v_lng) < 0.06))
    );

    insert into public.courts (name, lat, lng, address, court_count, status, source, google_place_id, reviewed_at)
    values (v_name, v_lat, v_lng, nullif(left(btrim(coalesce(v_spot ->> 'a', '')), 200), ''),
            case when v_count > 0 then v_count end, 'approved', 'map', v_place, now());
    v_added := v_added + 1;
  end loop;
  return v_added;
end;
$$;

revoke execute on function public.add_nearby_map_courts(jsonb), public.seed_map_courts(jsonb) from public, anon, authenticated;
grant execute on function public.add_nearby_map_courts(jsonb) to authenticated;

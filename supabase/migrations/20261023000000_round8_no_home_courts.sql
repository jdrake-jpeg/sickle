-- Round 8: no home courts.
-- Some mapped courts were backyards. This (1) removes the ones that look like
-- homes or have no name, (2) makes the bulk adders refuse them, and (3) makes
-- sure a court an admin removed is never added back by the map.

-- Names that point to a home, or a court nobody named (just "Pickleball courts").
create or replace function public.is_home_court_name(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_name, '') ~* '^pickleball courts?( on .*)?$'
      or coalesce(p_name, '') ~* '\m(home|house|residen[a-z]*|private|backyard|back yard|driveway|hoa|apartments?|condos?|townhomes?)\M';
$$;

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
      or v_lat not between -90 and 90 or v_lng not between -180 and 180
      or public.is_home_court_name(v_name);

    -- Removed or hidden before: stays gone.
    continue when exists (select 1 from public.courts c where c.google_place_id = v_place and c.status = 'rejected' and c.source = 'map');

    continue when exists (
      select 1 from public.courts c
      where c.status in ('approved', 'pending') and not c.is_private
        and (c.google_place_id = v_place or public.distance_miles(c.lat, c.lng, v_lat, v_lng) < 0.06)
    );

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
    -- Unnamed courts are only seeded when the script found the park or school
    -- they sit in ("Pickleball courts at <place>").
    continue when v_place is null or v_lat is null or v_lng is null
      or v_lat not between -90 and 90 or v_lng not between -180 and 180
      or public.is_home_court_name(v_name);
    continue when exists (select 1 from public.courts c where c.google_place_id = v_place and c.status = 'rejected' and c.source = 'map');

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

-- A mapped court an admin removes is hidden instead of deleted, so the map
-- never adds it back. Everything else works as before.
create or replace function public.admin_remove_court(p_court uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Only admins can remove courts'; end if;
  if not exists (select 1 from public.courts where id = p_court) then raise exception 'Unknown court'; end if;

  if exists (select 1 from public.challenges where court_id = p_court)
     or exists (select 1 from public.matches where court_id = p_court)
     or exists (select 1 from public.courts where id = p_court and source = 'map' and google_place_id is not null) then
    update public.courts
    set status = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_note = 'Removed by an admin'
    where id = p_court;
    return 'hidden';
  end if;

  delete from public.courts where id = p_court;
  return 'deleted';
end;
$$;

-- Clean up: mapped courts that look like homes or have no name. Ones with
-- challenges or matches are hidden (so history stays); the rest are deleted.
-- Courts people added by hand are never touched.
update public.courts
set status = 'rejected', reviewed_at = now(), review_note = 'Removed: home or unnamed court'
where source = 'map' and google_place_id like 'osm:%' and status <> 'rejected'
  and public.is_home_court_name(name)
  and (exists (select 1 from public.challenges h where h.court_id = courts.id)
       or exists (select 1 from public.matches m where m.court_id = courts.id));

delete from public.courts
where source = 'map' and google_place_id like 'osm:%' and status <> 'rejected'
  and public.is_home_court_name(name);

revoke execute on function public.add_nearby_map_courts(jsonb), public.seed_map_courts(jsonb), public.is_home_court_name(text) from public, anon, authenticated;
grant execute on function public.add_nearby_map_courts(jsonb) to authenticated;

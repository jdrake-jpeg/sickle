-- Court sign-up with admin approval.
--
-- Anyone signed in can submit a court. It stays pending, visible only to the
-- player who submitted it and to admins, until an admin approves it. Only
-- approved courts show on the map, get leaderboards and can host challenges.
--
-- Admins are profiles with is_admin = true. Players can't set it themselves;
-- grant it from the Supabase SQL editor:
--   update public.profiles set is_admin = true where username = 'drake';

-- ---------------------------------------------------------------------------
-- Admins
-- ---------------------------------------------------------------------------

alter table public.profiles add column is_admin boolean not null default false;

-- Players create their own profile but can't make themselves admin.
revoke insert on public.profiles from authenticated;
grant insert (id, username, display_name, avatar_url, skill_level) on public.profiles to authenticated;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- Court submissions
-- ---------------------------------------------------------------------------

create type public.court_status as enum ('pending', 'approved', 'rejected');

-- Courts that already exist were entered by hand, so they start approved.
alter table public.courts
  add column status public.court_status not null default 'approved',
  add column submitted_by uuid references public.profiles (id) on delete set null,
  add column submission_note text check (char_length(submission_note) <= 500),
  add column reviewed_by uuid references public.profiles (id) on delete set null,
  add column reviewed_at timestamptz,
  add column review_note text check (char_length(review_note) <= 500);
alter table public.courts alter column status set default 'pending';
alter table public.courts add constraint courts_name_length check (char_length(name) between 2 and 60);

create index courts_status_idx on public.courts (status);

drop policy "courts readable" on public.courts;
create policy "courts readable" on public.courts for select to authenticated
  using (status = 'approved' or submitted_by = auth.uid() or public.is_admin());

-- Preferred courts must be approved ones.
drop policy "manage own preferred courts" on public.preferred_courts;
create policy "manage own preferred courts" on public.preferred_courts for all to authenticated
  using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and exists (select 1 from public.courts c where c.id = court_id and c.status = 'approved')
  );

-- Submits a court for an admin to review. Returns the new court's id.
create function public.submit_court(
  p_name text,
  p_lat double precision,
  p_lng double precision,
  p_address text default null,
  p_court_count integer default null,
  p_indoor boolean default false,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_name text := btrim(p_name);
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
  if (select count(*) from public.courts where submitted_by = v_me and status = 'pending') >= 5 then
    raise exception 'You have 5 courts waiting for review. Wait for those first';
  end if;
  -- About 100 meters: close enough to be the same place.
  if exists (
    select 1 from public.courts
    where status <> 'rejected' and public.distance_miles(lat, lng, p_lat, p_lng) < 0.06
  ) then
    raise exception 'That court is already listed or waiting for review';
  end if;

  insert into public.courts (name, lat, lng, address, court_count, indoor, status, submitted_by, submission_note)
  values (v_name, p_lat, p_lng, nullif(btrim(p_address), ''), p_court_count, coalesce(p_indoor, false),
          'pending', v_me, nullif(btrim(p_note), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- Admins approve or reject a pending court. Approving can also fix its name.
create function public.review_court(p_court uuid, p_approve boolean, p_note text default null, p_name text default null)
returns public.court_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_court public.courts;
  v_status public.court_status := case when p_approve then 'approved'::public.court_status else 'rejected'::public.court_status end;
begin
  if not public.is_admin() then raise exception 'Only admins can review courts'; end if;
  select * into v_court from public.courts where id = p_court for update;
  if v_court.id is null then raise exception 'Unknown court'; end if;
  if v_court.status <> 'pending' then raise exception 'This court was already %', v_court.status; end if;

  update public.courts
  set status = v_status,
      name = coalesce(nullif(btrim(p_name), ''), name),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = nullif(btrim(p_note), '')
  where id = p_court;
  return v_status;
end;
$$;

-- Challenges can only be played at approved courts.
create or replace function public.send_challenge(p_my_team uuid, p_their_team uuid, p_court uuid, p_time timestamptz)
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
  if not exists (select 1 from public.courts where id = p_court and status = 'approved') then
    raise exception 'Pick an approved court';
  end if;
  if p_time < now() then raise exception 'Pick a time in the future'; end if;

  insert into public.challenges (challenger_team_id, challenged_team_id, court_id, proposed_time, created_by)
  values (p_my_team, p_their_team, p_court, p_time, v_me)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function
  public.is_admin(),
  public.submit_court(text, double precision, double precision, text, integer, boolean, text),
  public.review_court(uuid, boolean, text, text),
  public.send_challenge(uuid, uuid, uuid, timestamptz)
from public, anon;
grant execute on function
  public.is_admin(),
  public.submit_court(text, double precision, double precision, text, integer, boolean, text),
  public.review_court(uuid, boolean, text, text),
  public.send_challenge(uuid, uuid, uuid, timestamptz)
to authenticated;

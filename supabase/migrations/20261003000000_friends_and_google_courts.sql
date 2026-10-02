-- Friends, and courts found through Google.
--
-- Friends: either player sends a request, the other accepts. Blocked players
-- can't friend each other. recent_opponents lists people you've challenged or
-- played, so it's easy to add them.
--
-- Google courts: the app can search Google Places for pickleball courts (through
-- the find-courts edge function, which keeps the API key on the server). A court
-- added from Google keeps its place id so it's never listed twice. Courts an
-- admin adds are approved right away.

-- ---------------------------------------------------------------------------
-- Friends
-- ---------------------------------------------------------------------------

create type public.friendship_status as enum ('pending', 'accepted');

create table public.friendships (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status public.friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
-- One friendship per pair, whichever way it was sent.
create unique index friendships_pair_idx on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee_idx on public.friendships (addressee_id);

alter table public.friendships enable row level security;
-- You can see your own friendships. Changes go through the functions below.
create policy "own friendships" on public.friendships for select to authenticated
  using (auth.uid() in (requester_id, addressee_id));
revoke insert, update, delete on public.friendships from authenticated, anon;

create function public.players_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a)
  );
$$;

-- Sends a friend request, or accepts theirs if they already sent you one.
-- Returns the friendship's status.
create function public.add_friend(p_profile uuid)
returns public.friendship_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_existing public.friendships;
begin
  if v_me is null or not exists (select 1 from public.profiles where id = v_me) then
    raise exception 'Finish setting up your profile first';
  end if;
  if p_profile = v_me then raise exception 'You can''t friend yourself'; end if;
  if not exists (select 1 from public.profiles where id = p_profile) then raise exception 'Unknown player'; end if;
  if public.players_blocked(v_me, p_profile) then raise exception 'You can''t friend this player'; end if;

  select * into v_existing from public.friendships
  where (requester_id = v_me and addressee_id = p_profile) or (requester_id = p_profile and addressee_id = v_me)
  for update;

  if v_existing.requester_id is null then
    insert into public.friendships (requester_id, addressee_id) values (v_me, p_profile);
    return 'pending';
  end if;
  if v_existing.status = 'pending' and v_existing.addressee_id = v_me then
    update public.friendships set status = 'accepted', accepted_at = now()
    where requester_id = p_profile and addressee_id = v_me;
    return 'accepted';
  end if;
  return v_existing.status;
end;
$$;

-- Declines a request, cancels one you sent, or unfriends.
create function public.remove_friend(p_profile uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.friendships
  where (requester_id = auth.uid() and addressee_id = p_profile)
     or (requester_id = p_profile and addressee_id = auth.uid());
$$;

-- Blocking someone also ends any friendship.
create function public.end_friendship_on_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.friendships
  where (requester_id = new.blocker_id and addressee_id = new.blocked_id)
     or (requester_id = new.blocked_id and addressee_id = new.blocker_id);
  return new;
end;
$$;
create trigger blocks_end_friendship after insert on public.blocks
  for each row execute function public.end_friendship_on_block();

-- Your friends and requests. relation is 'friend', 'incoming' (they asked you)
-- or 'outgoing' (you asked them).
create function public.my_friends()
returns table (profile_id uuid, display_name text, username citext, skill_level numeric, relation text, since timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.username, p.skill_level,
         case when f.status = 'accepted' then 'friend'
              when f.addressee_id = auth.uid() then 'incoming'
              else 'outgoing' end,
         coalesce(f.accepted_at, f.created_at)
  from public.friendships f
  join public.profiles p on p.id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where auth.uid() in (f.requester_id, f.addressee_id)
  order by 5, p.display_name;
$$;

-- People you've challenged, been challenged by, or played against, most
-- recent first, with whether you're already friends.
create function public.recent_opponents()
returns table (profile_id uuid, display_name text, username citext, skill_level numeric, last_seen timestamptz, played boolean, relation text)
language sql
stable
security definer
set search_path = ''
as $$
  with my_teams as (
    select id from public.teams where auth.uid() in (player_low, player_high)
  ),
  faced as (
    select case when c.challenger_team_id in (select id from my_teams) then c.challenged_team_id else c.challenger_team_id end as team_id,
           coalesce(m.played_at, c.created_at) as at,
           (m.status = 'confirmed') as played
    from public.challenges c
    left join public.matches m on m.challenge_id = c.id
    where c.challenger_team_id in (select id from my_teams) or c.challenged_team_id in (select id from my_teams)
  ),
  people as (
    select unnest(array[t.player_low, t.player_high]) as profile_id, f.at, coalesce(f.played, false) as played
    from faced f join public.teams t on t.id = f.team_id
  )
  select p.id, p.display_name, p.username, p.skill_level, max(x.at), bool_or(x.played),
         (select case when f.status = 'accepted' then 'friend'
                      when f.addressee_id = auth.uid() then 'incoming'
                      else 'outgoing' end
          from public.friendships f
          where (f.requester_id = auth.uid() and f.addressee_id = p.id) or (f.requester_id = p.id and f.addressee_id = auth.uid()))
  from people x
  join public.profiles p on p.id = x.profile_id
  where p.id <> auth.uid() and not public.players_blocked(auth.uid(), p.id)
  group by p.id
  order by max(x.at) desc
  limit 50;
$$;

-- ---------------------------------------------------------------------------
-- Courts from Google
-- ---------------------------------------------------------------------------

alter table public.courts add column google_place_id text unique;

drop function public.submit_court(text, double precision, double precision, text, integer, boolean, text);

-- Submits a court for review, or adds it straight to the map when an admin
-- submits it. Returns the new court's id.
create function public.submit_court(
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
  if not v_admin and (select count(*) from public.courts where submitted_by = v_me and status = 'pending') >= 5 then
    raise exception 'You have 5 courts waiting for review. Wait for those first';
  end if;
  -- Same Google place, or within about 100 meters: the same court.
  if exists (
    select 1 from public.courts
    where status <> 'rejected'
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

revoke execute on function
  public.players_blocked(uuid, uuid),
  public.end_friendship_on_block(),
  public.add_friend(uuid),
  public.remove_friend(uuid),
  public.my_friends(),
  public.recent_opponents(),
  public.submit_court(text, double precision, double precision, text, integer, boolean, text, text)
from public, anon, authenticated;
grant execute on function
  public.add_friend(uuid),
  public.remove_friend(uuid),
  public.my_friends(),
  public.recent_opponents(),
  public.submit_court(text, double precision, double precision, text, integer, boolean, text, text)
to authenticated;

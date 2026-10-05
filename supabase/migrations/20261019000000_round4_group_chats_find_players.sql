-- Round 4:
--   * accepting a doubles challenge: pick which of your teams plays
--   * a group chat for the four players once a doubles challenge is accepted,
--     with unread counts, quick messages and a one tap delete
--   * Find people filters: rating, nearby, friends in common, friends

-- ---------------------------------------------------------------------------
-- Accept with a team
-- ---------------------------------------------------------------------------
-- Same as before, plus an optional team. A doubles challenge is sent to one of
-- the other player's teams, and whoever accepts can play it with any of their
-- own doubles teams instead.

drop function public.respond_to_challenge(uuid, boolean);

create function public.respond_to_challenge(p_challenge uuid, p_accept boolean, p_team uuid default null)
returns public.challenge_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.challenges;
  v_status public.challenge_status := case when p_accept then 'accepted'::public.challenge_status else 'declined'::public.challenge_status end;
  v_team uuid;
  v_new public.teams;
  v_ch public.teams;
begin
  select * into v_c from public.challenges where id = p_challenge for update;
  if v_c.id is null then raise exception 'Unknown challenge'; end if;
  if v_c.status <> 'pending' then raise exception 'This challenge is already %', v_c.status; end if;
  if not public.is_team_member(v_c.challenged_team_id, auth.uid()) then
    raise exception 'Only the challenged team can respond';
  end if;

  v_team := v_c.challenged_team_id;
  if p_accept and p_team is not null and p_team <> v_c.challenged_team_id then
    select * into v_new from public.teams where id = p_team;
    select * into v_ch from public.teams where id = v_c.challenger_team_id;
    if v_new.id is null or v_new.deleted_at is not null or auth.uid() not in (v_new.player_low, v_new.player_high) then
      raise exception 'Pick one of your own teams';
    end if;
    if v_new.player_high is null or v_ch.player_high is null then
      raise exception 'Only doubles challenges can switch teams';
    end if;
    if v_new.player_low in (v_ch.player_low, v_ch.player_high) or v_new.player_high in (v_ch.player_low, v_ch.player_high) then
      raise exception 'A player cannot be on both teams';
    end if;
    if public.teams_blocked(p_team, v_c.challenger_team_id) then
      raise exception 'You cannot play this team';
    end if;
    v_team := p_team;
  end if;

  update public.challenges
  set status = v_status, challenged_team_id = v_team, updated_at = now()
  where id = p_challenge;
  return v_status;
end;
$$;

revoke all on function public.respond_to_challenge(uuid, boolean, uuid) from public, anon;
grant execute on function public.respond_to_challenge(uuid, boolean, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Group chats for accepted doubles challenges
-- ---------------------------------------------------------------------------

create table public.group_chats (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null unique references public.challenges (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.group_chat_members (
  chat_id uuid not null references public.group_chats (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (chat_id, profile_id)
);
create index group_chat_members_profile_idx on public.group_chat_members (profile_id);

create table public.group_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.group_chats (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 200),
  created_at timestamptz not null default now()
);
create index group_messages_chat_idx on public.group_messages (chat_id, created_at desc);

-- Everything goes through the functions below.
alter table public.group_chats enable row level security;
alter table public.group_chat_members enable row level security;
alter table public.group_messages enable row level security;
revoke all on public.group_chats, public.group_chat_members, public.group_messages from authenticated, anon;

-- When a doubles challenge is accepted, its four players get a chat.
create function public.make_group_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chat uuid;
begin
  if new.status <> 'accepted' or old.status = 'accepted' then return new; end if;
  if exists (
    select 1 from public.teams t
    where t.id in (new.challenger_team_id, new.challenged_team_id) and t.player_high is null
  ) then
    return new;
  end if;
  insert into public.group_chats (challenge_id) values (new.id)
  on conflict (challenge_id) do nothing
  returning id into v_chat;
  if v_chat is null then return new; end if;
  insert into public.group_chat_members (chat_id, profile_id)
  select distinct v_chat, x
  from public.teams t
  cross join lateral unnest(array[t.player_low, t.player_high]) as x
  join public.profiles p on p.id = x and p.deleted_at is null
  where t.id in (new.challenger_team_id, new.challenged_team_id) and x is not null;
  return new;
end;
$$;

create trigger challenges_make_group_chat
after update of status on public.challenges
for each row execute function public.make_group_chat();

-- Your group chats, newest first.
create function public.my_group_chats()
returns table (
  chat_id uuid, challenge_id uuid, title text, court_name text, proposed_time timestamptz,
  challenge_status public.challenge_status, members text,
  last_body text, last_at timestamptz, last_sender text, unread bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, c.id,
         public.team_display_name(c.challenger_team_id) || ' vs ' || public.team_display_name(c.challenged_team_id),
         co.name, c.proposed_time, c.status,
         (select string_agg(split_part(pr.display_name, ' ', 1), ', ' order by pr.display_name)
          from public.group_chat_members gm
          join public.profiles pr on pr.id = gm.profile_id
          where gm.chat_id = g.id and gm.profile_id <> auth.uid()),
         l.body, coalesce(l.created_at, g.created_at),
         (select split_part(pr.display_name, ' ', 1) from public.profiles pr where pr.id = l.sender_id),
         (select count(*) from public.group_messages u
          where u.chat_id = g.id and u.sender_id <> auth.uid() and u.created_at > m.last_read_at)
  from public.group_chat_members m
  join public.group_chats g on g.id = m.chat_id
  join public.challenges c on c.id = g.challenge_id
  join public.courts co on co.id = c.court_id
  left join lateral (
    select x.body, x.created_at, x.sender_id
    from public.group_messages x
    where x.chat_id = g.id
    order by x.created_at desc
    limit 1
  ) l on true
  where m.profile_id = auth.uid()
  order by coalesce(l.created_at, g.created_at) desc;
$$;

-- The latest messages in one of your group chats, oldest first.
create function public.group_conversation(p_chat uuid, p_limit integer default 100)
returns table (id uuid, mine boolean, sender_name text, body text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (
    select m.id, m.sender_id = auth.uid(), split_part(pr.display_name, ' ', 1), m.body, m.created_at
    from public.group_messages m
    join public.profiles pr on pr.id = m.sender_id
    where m.chat_id = p_chat
      and exists (select 1 from public.group_chat_members gm where gm.chat_id = p_chat and gm.profile_id = auth.uid())
    order by m.created_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 200)
  ) recent
  order by created_at;
$$;

create function public.send_group_message(p_chat uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
begin
  if not exists (select 1 from public.group_chat_members where chat_id = p_chat and profile_id = v_me) then
    raise exception 'You are not in this chat';
  end if;
  if v_body = '' then raise exception 'Write a message first'; end if;
  if char_length(v_body) > 200 then raise exception 'Keep messages under 200 characters'; end if;
  if (select count(*) from public.group_messages where sender_id = v_me and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Slow down a little, then try again';
  end if;
  insert into public.group_messages (chat_id, sender_id, body) values (p_chat, v_me, v_body) returning id into v_id;
  update public.group_chat_members set last_read_at = now() where chat_id = p_chat and profile_id = v_me;
  return v_id;
end;
$$;

create function public.mark_group_read(p_chat uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.group_chat_members set last_read_at = now() where chat_id = p_chat and profile_id = auth.uid();
$$;

-- Deleting a chat removes it for you. When the last person leaves, it is gone.
create function public.leave_group_chat(p_chat uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.group_chat_members where chat_id = p_chat and profile_id = auth.uid();
  delete from public.group_chats g
  where g.id = p_chat and not exists (select 1 from public.group_chat_members m where m.chat_id = g.id);
end;
$$;

create function public.unread_group_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)
  from public.group_chat_members m
  join public.group_messages u on u.chat_id = m.chat_id and u.sender_id <> m.profile_id and u.created_at > m.last_read_at
  where m.profile_id = auth.uid();
$$;

-- A new message pings the other three, if they have message alerts on.
create function public.notify_on_group_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p uuid;
begin
  for p in select m.profile_id from public.group_chat_members m where m.chat_id = new.chat_id and m.profile_id <> new.sender_id
  loop
    perform public.notify(p, 'messages', public.first_name(new.sender_id) || ' in your game chat', left(new.body, 120), jsonb_build_object('path', '/chats'));
  end loop;
  return new;
end;
$$;

create trigger group_messages_notify
after insert on public.group_messages
for each row execute function public.notify_on_group_message();

-- Deleting an account removes the person from group chats and their messages.
create function public.purge_group_chats_on_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.group_messages where sender_id = new.id;
  delete from public.group_chat_members where profile_id = new.id;
  delete from public.group_chats g where not exists (select 1 from public.group_chat_members m where m.chat_id = g.id);
  return new;
end;
$$;

create trigger profiles_purge_group_chats
after update of deleted_at on public.profiles
for each row
when (old.deleted_at is null and new.deleted_at is not null)
execute function public.purge_group_chats_on_delete();

revoke execute on function
  public.make_group_chat(),
  public.my_group_chats(),
  public.group_conversation(uuid, integer),
  public.send_group_message(uuid, text),
  public.mark_group_read(uuid),
  public.leave_group_chat(uuid),
  public.unread_group_count(),
  public.notify_on_group_message(),
  public.purge_group_chats_on_delete()
from public, anon, authenticated;
grant execute on function
  public.my_group_chats(),
  public.group_conversation(uuid, integer),
  public.send_group_message(uuid, text),
  public.mark_group_read(uuid),
  public.leave_group_chat(uuid),
  public.unread_group_count()
to authenticated;

-- ---------------------------------------------------------------------------
-- Find people: rating, nearby, friends in common, friends
-- ---------------------------------------------------------------------------
-- p_scope: 'people' (not your friends yet), 'friends', or 'all'.
-- Distance is to the closest place they play: where they are looking right
-- now, or a court they like or played at in the last 90 days. Rounded to half
-- a mile. p_radius_miles needs p_lat and p_lng.

create function public.find_players(
  p_min_skill numeric default null,
  p_max_skill numeric default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_miles double precision default null,
  p_common_only boolean default false,
  p_scope text default 'people'
)
returns table (
  profile_id uuid, display_name text, username citext, skill_level numeric,
  looking_now boolean, plays_singles boolean, plays_doubles boolean,
  mutual_friends integer, is_friend boolean, distance_miles double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  with my_friends as (
    select case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end as fid
    from public.friendships f
    where f.status = 'accepted' and auth.uid() in (f.requester_id, f.addressee_id)
  ),
  cand as (
    select p.id, p.display_name, p.username, p.skill_level, p.plays_singles, p.plays_doubles,
           (p.availability = 'looking_to_play' and p.availability_expires_at > now()) as looking_now,
           (select count(*)::integer
            from public.friendships f2
            where f2.status = 'accepted' and p.id in (f2.requester_id, f2.addressee_id)
              and case when f2.requester_id = p.id then f2.addressee_id else f2.requester_id end in (select fid from my_friends)) as mutual,
           exists (select 1 from my_friends mf where mf.fid = p.id) as is_friend,
           case when p_lat is null or p_lng is null then null else
             least(
               (select public.distance_miles(p_lat, p_lng, l.approx_lat, l.approx_lng)
                from public.player_locations l
                where l.profile_id = p.id and p.availability = 'looking_to_play' and p.availability_expires_at > now()),
               (select min(public.distance_miles(p_lat, p_lng, c.lat, c.lng))
                from public.courts c
                where c.status = 'approved' and not c.is_private
                  and (c.id in (select pc.court_id from public.preferred_courts pc where pc.profile_id = p.id)
                    or c.id in (select ch.court_id
                                from public.challenges ch
                                join public.teams t on t.id in (ch.challenger_team_id, ch.challenged_team_id)
                                where p.id in (t.player_low, t.player_high) and ch.created_at > now() - interval '90 days')))
             )
           end as dist,
           me.skill_level as my_skill
    from public.profiles p
    left join public.profiles me on me.id = auth.uid()
    where auth.uid() is not null
      and p.id <> auth.uid()
      and p.deleted_at is null
      and (p_min_skill is null or p.skill_level >= p_min_skill)
      and (p_max_skill is null or p.skill_level <= p_max_skill)
      and not public.players_blocked(auth.uid(), p.id)
  )
  select c.id, c.display_name, c.username, c.skill_level, c.looking_now, c.plays_singles, c.plays_doubles,
         c.mutual, c.is_friend,
         case when c.dist is null then null else greatest(0.5, round((c.dist * 2)::numeric) / 2)::double precision end
  from cand c
  where case coalesce(p_scope, 'people')
          when 'friends' then c.is_friend
          when 'all' then true
          else not c.is_friend
        end
    and (not coalesce(p_common_only, false) or c.mutual > 0)
    and (p_radius_miles is null or p_lat is null or p_lng is null or (c.dist is not null and c.dist <= least(p_radius_miles, 50)))
  order by c.looking_now desc,
           case when coalesce(p_common_only, false) then c.mutual else 0 end desc,
           c.dist nulls last,
           abs(coalesce(c.skill_level, 0) - coalesce(c.my_skill, 0)),
           c.display_name
  limit 60;
$$;

revoke all on function public.find_players(numeric, numeric, double precision, double precision, double precision, boolean, text) from public, anon;
grant execute on function public.find_players(numeric, numeric, double precision, double precision, double precision, boolean, text) to authenticated;

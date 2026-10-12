-- Round 9:
--   * challenge one specific player in doubles when they have no team yet: they
--     pick their partner (which makes their team) when they accept
--   * people you create by name (no account yet), and linking one to a real
--     account later
--   * log a game that already happened, with no challenge
--   * edit or delete a played game: the other side confirms, unless nobody on
--     the other side is a real account, then it just happens
--   * your name can be changed again (your username stays locked)
--   * one call that returns everything about a match for its detail screen
--
-- Additive. Run once, after 20261023.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column is_placeholder boolean not null default false,
  add column owner_id uuid references public.profiles (id),
  add column linked_to uuid references public.profiles (id);
create index profiles_owner_idx on public.profiles (owner_id) where is_placeholder;

-- Names can be edited again. Usernames cannot.
grant update (display_name) on public.profiles to authenticated;

alter table public.challenges
  add column logged boolean not null default false,
  add column needs_partner boolean not null default false;

alter table public.matches add column deleted_at timestamptz;

-- ---------------------------------------------------------------------------
-- Small helpers (not callable from the app)
-- ---------------------------------------------------------------------------

create function public.team_has_real_member(p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.teams t
    join public.profiles p on p.id in (t.player_low, t.player_high)
    where t.id = p_team and not p.is_placeholder and p.deleted_at is null
  );
$$;

-- Someone you can put in a game: yourself, a person you created, or a friend.
create function public.person_ok(p_me uuid, p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_me = p_other or exists (
    select 1 from public.profiles p
    where p.id = p_other and p.deleted_at is null
      and (
        (p.is_placeholder and p.owner_id = p_me and p.linked_to is null)
        or (not p.is_placeholder and public.are_friends(p_me, p_other) and not public.players_blocked(p_me, p_other))
      )
  );
$$;

-- The team for one person (singles) or two. Makes it if it isn't there, and
-- brings back a deleted one.
create function public.ensure_team(p_a uuid, p_b uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_lo uuid;
  v_hi uuid;
begin
  if p_b is null then
    select id into v_id from public.teams where player_low = p_a and player_high is null;
    if v_id is null then
      insert into public.teams (player_low, player_high, created_by) values (p_a, null, p_a) returning id into v_id;
    end if;
    return v_id;
  end if;
  v_lo := least(p_a, p_b);
  v_hi := greatest(p_a, p_b);
  select id into v_id from public.teams where player_low = v_lo and player_high = v_hi;
  if v_id is null then
    insert into public.teams (player_low, player_high, created_by)
    values (v_lo, v_hi, coalesce(auth.uid(), p_a))
    returning id into v_id;
  else
    update public.teams set deleted_at = null where id = v_id and deleted_at is not null;
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- People you create
-- ---------------------------------------------------------------------------

create function public.create_person(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_id uuid := gen_random_uuid();
begin
  if v_me is null then raise exception 'Not signed in'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 40 then raise exception 'Give them a name up to 40 characters'; end if;
  if (select count(*) from public.profiles where owner_id = v_me and is_placeholder and linked_to is null and deleted_at is null) >= 50 then
    raise exception 'You can keep up to 50 people. Remove some you do not use';
  end if;
  insert into public.profiles (id, username, display_name, is_placeholder, owner_id)
  values (v_id, 'p_' || substr(replace(v_id::text, '-', ''), 1, 12), v_name, true, v_me);
  return v_id;
end;
$$;

create function public.rename_person(p_person uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
begin
  if char_length(v_name) < 1 or char_length(v_name) > 40 then raise exception 'Give them a name up to 40 characters'; end if;
  update public.profiles set display_name = v_name
  where id = p_person and is_placeholder and owner_id = auth.uid() and linked_to is null and deleted_at is null;
  if not found then raise exception 'That is not one of your people'; end if;
end;
$$;

create function public.my_people()
returns table (profile_id uuid, display_name text, singles_team_id uuid, wins bigint, losses bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, t.id, coalesce(r.wins, 0), coalesce(r.losses, 0)
  from public.profiles p
  left join public.teams t on t.player_low = p.id and t.player_high is null
  left join public.team_records r on r.team_id = t.id
  where p.is_placeholder and p.owner_id = auth.uid() and p.linked_to is null and p.deleted_at is null
  order by p.display_name;
$$;

-- Only for someone who never played a game.
create function public.delete_person(p_person uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = p_person and is_placeholder and owner_id = auth.uid() and linked_to is null and deleted_at is null
  ) then
    raise exception 'That is not one of your people';
  end if;
  if exists (
    select 1 from public.teams t
    join public.challenges c on t.id in (c.challenger_team_id, c.challenged_team_id)
    where p_person in (t.player_low, t.player_high)
  ) then
    raise exception 'They have games logged, so they can''t be removed. You can link them to an account instead';
  end if;
  delete from public.teams where p_person in (player_low, player_high);
  delete from public.profiles where id = p_person;
end;
$$;

-- Moves everything on one team onto another.
create function public.repoint_team(p_old uuid, p_new uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.challenges set challenger_team_id = p_new where challenger_team_id = p_old;
  update public.challenges set challenged_team_id = p_new where challenged_team_id = p_old;
  update public.matches set team_a_id = p_new where team_a_id = p_old;
  update public.matches set team_b_id = p_new where team_b_id = p_old;
  update public.matches set winner_team_id = p_new where winner_team_id = p_old;
  update public.matches set awaiting_team_id = p_new where awaiting_team_id = p_old;
  update public.score_proposals set team_id = p_new where team_id = p_old;
  update public.match_confirmations set team_id = p_new where team_id = p_old;
end;
$$;

-- The person who made a name up can attach it to a real friend's account once
-- that friend is on the app. Their games and teams move over.
create function public.link_person_to_account(p_person uuid, p_account uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  t public.teams;
  v_other uuid;
  v_target uuid;
  v_existing public.teams;
  v_moved integer;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_person and is_placeholder and owner_id = v_me and linked_to is null and deleted_at is null
  ) then
    raise exception 'That is not one of your people';
  end if;
  if not exists (select 1 from public.profiles where id = p_account and not is_placeholder and deleted_at is null) then
    raise exception 'Pick a real account';
  end if;
  if p_account = v_me then raise exception 'That is you'; end if;
  if not public.person_ok(v_me, p_account) then
    raise exception 'You can only link to a friend. Add them as a friend first';
  end if;

  -- They can't have been on the same team, or on both sides of one game.
  if exists (select 1 from public.teams where p_person in (player_low, player_high) and p_account in (player_low, player_high)) then
    raise exception 'They already share a team, so they can''t be the same person';
  end if;
  if exists (
    select 1
    from public.challenges c
    join public.teams a on a.id = c.challenger_team_id
    join public.teams b on b.id = c.challenged_team_id
    where (p_person in (a.player_low, a.player_high) and p_account in (b.player_low, b.player_high))
       or (p_person in (b.player_low, b.player_high) and p_account in (a.player_low, a.player_high))
  ) then
    raise exception 'They played each other, so they can''t be the same person';
  end if;

  select count(distinct m.id) into v_moved
  from public.matches m
  join public.teams x on x.id in (m.team_a_id, m.team_b_id)
  where p_person in (x.player_low, x.player_high) and m.deleted_at is null;

  for t in select * from public.teams where p_person in (player_low, player_high) loop
    if t.player_high is null then
      v_target := public.ensure_team(p_account, null);
      perform public.repoint_team(t.id, v_target);
      delete from public.teams where id = t.id;
    else
      v_other := case when t.player_low = p_person then t.player_high else t.player_low end;
      select * into v_existing from public.teams
      where player_low = least(p_account, v_other) and player_high = greatest(p_account, v_other);
      if v_existing.id is null then
        update public.teams
        set player_low = least(p_account, v_other), player_high = greatest(p_account, v_other)
        where id = t.id;
      else
        perform public.repoint_team(t.id, v_existing.id);
        if t.deleted_at is null and v_existing.deleted_at is not null then
          update public.teams set deleted_at = null where id = v_existing.id;
        end if;
        delete from public.teams where id = t.id;
      end if;
    end if;
  end loop;

  update public.profiles set linked_to = p_account, deleted_at = now() where id = p_person;

  perform public.notify(
    p_account, 'teams', 'Games added to your profile',
    public.first_name(v_me) || ' linked you to ' || (select display_name from public.profiles where id = p_person)
      || '. ' || v_moved || ' game' || case when v_moved = 1 then '' else 's' end || ' now show in your history.',
    jsonb_build_object('path', '/profile')
  );
  return v_moved;
end;
$$;

-- People you create never show up in search or browse lists.
create or replace function public.search_players(p_query text)
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
    and p.deleted_at is null and not p.is_placeholder
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

create or replace function public.browse_players(
  p_min_skill numeric default null,
  p_max_skill numeric default null,
  p_format text default null
)
returns table (
  profile_id uuid, display_name text, username citext, skill_level numeric,
  looking_now boolean, plays_singles boolean, plays_doubles boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.username, p.skill_level,
         p.availability = 'looking_to_play' and p.availability_expires_at > now(),
         p.plays_singles, p.plays_doubles
  from public.profiles p
  left join public.profiles me on me.id = auth.uid()
  where auth.uid() is not null
    and p.id <> auth.uid()
    and p.deleted_at is null and not p.is_placeholder
    and (p_min_skill is null or p.skill_level >= p_min_skill)
    and (p_max_skill is null or p.skill_level <= p_max_skill)
    and (p_format is null or (p_format = 'singles' and p.plays_singles) or (p_format = 'doubles' and p.plays_doubles))
    and not public.players_blocked(auth.uid(), p.id)
    and not public.are_friends(auth.uid(), p.id)
  order by (p.availability = 'looking_to_play' and p.availability_expires_at > now()) desc,
           abs(coalesce(p.skill_level, 0) - coalesce(me.skill_level, 0)),
           p.display_name
  limit 60;
$$;

create or replace function public.similar_players(p_format text default null)
returns table (
  profile_id uuid, display_name text, username citext, skill_level numeric,
  looking_now boolean, plays_singles boolean, plays_doubles boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.username, p.skill_level,
         p.availability = 'looking_to_play' and p.availability_expires_at > now(),
         p.plays_singles, p.plays_doubles
  from public.profiles me
  join public.profiles p on p.id <> me.id
  where me.id = auth.uid()
    and me.skill_level is not null
    and p.deleted_at is null and not p.is_placeholder
    and p.skill_level is not null
    and abs(p.skill_level - me.skill_level) <= 0.5
    and (p_format is null or (p_format = 'singles' and p.plays_singles) or (p_format = 'doubles' and p.plays_doubles))
    and not public.players_blocked(me.id, p.id)
    and not public.are_friends(me.id, p.id)
  order by (p.availability = 'looking_to_play' and p.availability_expires_at > now()) desc,
           abs(p.skill_level - me.skill_level), p.display_name
  limit 30;
$$;

create or replace function public.find_players(
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
      and p.deleted_at is null and not p.is_placeholder
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

-- ---------------------------------------------------------------------------
-- Challenging one player in doubles, no team needed on their side
-- ---------------------------------------------------------------------------
-- The challenge sits on their built in singles team until they accept. They
-- pick a partner then, which makes their team (or reuses the one they have).

create or replace function public.challenges_check_open()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
begin
  if new.logged then return new; end if;
  for p in
    select pr.id, pr.display_name, pr.challenges_from
    from public.teams t
    join public.profiles pr on pr.id in (t.player_low, t.player_high)
    where t.id = new.challenged_team_id and pr.id <> new.created_by
  loop
    if p.challenges_from = 'nobody' then
      raise exception '% isn''t taking challenges right now', split_part(p.display_name, ' ', 1);
    end if;
    if p.challenges_from = 'friends' and not public.are_friends(new.created_by, p.id) then
      raise exception '% only takes challenges from friends', split_part(p.display_name, ' ', 1);
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public.notify_on_challenge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p uuid;
  v_court text;
  v_mine text;
  v_singles boolean;
begin
  if new.logged then return new; end if;
  select name into v_court from public.courts where id = new.court_id;
  v_mine := public.team_display_name(new.challenger_team_id);
  select player_high is null and not new.needs_partner into v_singles from public.teams where id = new.challenged_team_id;
  for p in
    select x from public.teams t cross join lateral unnest(array[t.player_low, t.player_high]) as x
    where t.id = new.challenged_team_id and x is not null and x <> new.created_by
  loop
    perform public.notify(
      p, 'challenges',
      case when v_singles then 'New singles challenge' else 'New doubles challenge' end,
      v_mine || ' challenged you at ' || coalesce(v_court, 'a court') || case when new.best_of = 1 then ', one game' else ', best of 3' end,
      jsonb_build_object('path', '/challenges')
    );
  end loop;
  return new;
end;
$$;

create function public.send_challenge_to_player(
  p_my_team uuid, p_player uuid, p_court uuid, p_time timestamptz, p_best_of smallint default 3
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_mine public.teams;
  v_theirs uuid;
  v_id uuid;
begin
  if not public.is_team_member(p_my_team, v_me) then raise exception 'You are not on that team'; end if;
  select * into v_mine from public.teams where id = p_my_team and deleted_at is null;
  if v_mine.id is null or v_mine.player_high is null then raise exception 'Pick your doubles team'; end if;
  if p_best_of is null or p_best_of not in (1, 3) then raise exception 'Pick one game or best of 3'; end if;
  if not exists (select 1 from public.profiles where id = p_player and not is_placeholder and deleted_at is null) then
    raise exception 'Unknown player';
  end if;
  if p_player in (v_mine.player_low, v_mine.player_high) then raise exception 'A player cannot be on both teams'; end if;
  v_theirs := public.ensure_team(p_player, null);
  if public.teams_blocked(p_my_team, v_theirs) then raise exception 'You cannot challenge this player'; end if;
  if not exists (select 1 from public.courts where id = p_court and status = 'approved') then
    raise exception 'Pick an approved court';
  end if;
  if p_time < now() then raise exception 'Pick a time in the future'; end if;

  insert into public.challenges (challenger_team_id, challenged_team_id, court_id, proposed_time, created_by, best_of, needs_partner)
  values (p_my_team, v_theirs, p_court, p_time, v_me, p_best_of, true)
  returning id into v_id;
  return v_id;
end;
$$;

-- Accept a "needs a partner" challenge by naming your partner.
create function public.accept_challenge_with_partner(p_challenge uuid, p_partner uuid)
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
  if v_c.status <> 'pending' then raise exception 'This challenge is already %', v_c.status; end if;
  if not v_c.needs_partner then raise exception 'This challenge already has a team'; end if;
  if not public.is_team_member(v_c.challenged_team_id, v_me) then raise exception 'Only the challenged player can respond'; end if;
  if p_partner is null or p_partner = v_me then raise exception 'Pick a partner'; end if;
  if not public.person_ok(v_me, p_partner) then
    raise exception 'Your partner has to be a friend or someone you created';
  end if;
  select * into v_ch from public.teams where id = v_c.challenger_team_id;
  if p_partner in (v_ch.player_low, v_ch.player_high) then raise exception 'A player cannot be on both teams'; end if;

  v_team := public.ensure_team(v_me, p_partner);
  if public.teams_blocked(v_team, v_c.challenger_team_id) then raise exception 'You cannot play this team'; end if;

  update public.challenges
  set status = 'accepted', challenged_team_id = v_team, needs_partner = false, updated_at = now()
  where id = p_challenge;
  return v_team;
end;
$$;

-- Accepting a "needs a partner" challenge as a singles game is never allowed.
-- Switching to one of your own doubles teams (the older way) still works.
create function public.challenges_partner_first()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.needs_partner and new.status = 'accepted' then
    if exists (select 1 from public.teams where id = new.challenged_team_id and player_high is null) then
      raise exception 'Pick your partner before accepting';
    end if;
    new.needs_partner := false;
  end if;
  return new;
end;
$$;

create trigger challenges_partner_first
before update of status, challenged_team_id on public.challenges
for each row execute function public.challenges_partner_first();

-- ---------------------------------------------------------------------------
-- Log a game that already happened
-- ---------------------------------------------------------------------------
-- Scores are [your team, their team] for each game. Singles: no partner and no
-- second opponent. Everyone must be you, a friend, or someone you created.
-- If nobody on the other side is a real account it counts right away. Otherwise
-- they confirm it like any score.

create function public.log_game(
  p_court uuid, p_played_at timestamptz, p_best_of smallint, p_games jsonb,
  p_partner uuid, p_opp1 uuid, p_opp2 uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_mine uuid;
  v_theirs uuid;
  v_winner text;
  v_challenge uuid;
  v_match uuid;
  v_auto boolean;
  who uuid;
begin
  if v_me is null then raise exception 'Not signed in'; end if;
  if p_best_of is null or p_best_of not in (1, 3) then raise exception 'Pick one game or best of 3'; end if;
  if p_opp1 is null then raise exception 'Pick who you played'; end if;
  if (p_partner is null) <> (p_opp2 is null) then raise exception 'Doubles needs a partner and two opponents. Singles needs just one opponent'; end if;
  if p_played_at is null or p_played_at > now() + interval '15 minutes' then raise exception 'A game cannot be in the future'; end if;
  if not exists (select 1 from public.courts where id = p_court and status = 'approved') then raise exception 'Pick an approved court'; end if;

  for who in select x from unnest(array[p_partner, p_opp1, p_opp2]) as x where x is not null loop
    if who = v_me then raise exception 'You can''t be on both sides'; end if;
    if not public.person_ok(v_me, who) then raise exception 'Everyone has to be a friend or someone you created'; end if;
  end loop;
  if p_partner is not null and (p_partner = p_opp1 or p_partner = p_opp2 or p_opp1 = p_opp2) then
    raise exception 'Each player can only be in the game once';
  end if;

  v_winner := public.match_winner(p_games, p_best_of);

  v_mine := public.ensure_team(v_me, p_partner);
  v_theirs := public.ensure_team(p_opp1, p_opp2);
  if public.teams_blocked(v_mine, v_theirs) then raise exception 'You cannot log a game with this team'; end if;

  v_auto := not public.team_has_real_member(v_theirs);

  insert into public.challenges (challenger_team_id, challenged_team_id, court_id, proposed_time, status, created_by, best_of, logged)
  values (v_mine, v_theirs, p_court, p_played_at, case when v_auto then 'completed'::public.challenge_status else 'accepted'::public.challenge_status end, v_me, p_best_of, true)
  returning id into v_challenge;

  insert into public.matches (
    challenge_id, team_a_id, team_b_id, court_id, played_at, status, awaiting_team_id, winner_team_id, submitted_by, resolved_at
  ) values (
    v_challenge, v_mine, v_theirs, p_court, p_played_at,
    case when v_auto then 'confirmed'::public.match_status else 'awaiting_confirmation'::public.match_status end,
    case when v_auto then null else v_theirs end,
    case when v_winner = 'a' then v_mine else v_theirs end,
    v_me,
    case when v_auto then now() else null end
  )
  returning id into v_match;

  perform public.replace_games(v_match, p_games);
  insert into public.score_proposals (match_id, round, team_id, profile_id, scores)
  values (v_match, 0, v_mine, v_me, p_games);

  return v_challenge;
end;
$$;

-- ---------------------------------------------------------------------------
-- Editing and deleting played games
-- ---------------------------------------------------------------------------
-- Anyone who played can propose a change. The other team confirms it. If the
-- other team has no real account on it, the change just happens. Either side
-- can propose again later.

create table public.match_changes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  kind text not null check (kind in ('edit', 'delete')),
  -- Scores in the match's own order (team A first).
  games jsonb,
  court_id uuid references public.courts (id),
  played_at timestamptz,
  proposed_by uuid not null references public.profiles (id),
  proposed_by_team uuid not null references public.teams (id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'applied')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index match_changes_one_pending on public.match_changes (match_id) where status = 'pending';

alter table public.match_changes enable row level security;
revoke all on public.match_changes from authenticated, anon;

create function public.apply_match_change(p_change uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.match_changes;
  m public.matches;
  v_best smallint;
  v_winner text;
begin
  select * into x from public.match_changes where id = p_change;
  select * into m from public.matches where id = x.match_id for update;
  if x.kind = 'delete' then
    update public.matches
    set status = 'voided', awaiting_team_id = null, resolved_at = coalesce(resolved_at, now()), updated_at = now(), deleted_at = now()
    where id = m.id;
    update public.challenges set status = 'cancelled', updated_at = now() where id = m.challenge_id;
  else
    select best_of into v_best from public.challenges where id = m.challenge_id;
    v_winner := public.match_winner(x.games, v_best);
    perform public.replace_games(m.id, x.games);
    update public.matches
    set winner_team_id = case when v_winner = 'a' then team_a_id else team_b_id end,
        played_at = coalesce(x.played_at, played_at),
        court_id = coalesce(x.court_id, court_id),
        status = 'confirmed', awaiting_team_id = null,
        resolved_at = coalesce(resolved_at, now()), updated_at = now()
    where id = m.id;
    update public.challenges set status = 'completed', updated_at = now() where id = m.challenge_id;
  end if;
end;
$$;

-- p_games: scores in the match's order (team A first). Leave null to keep them.
create function public.propose_match_change(
  p_match uuid, p_kind text, p_games jsonb default null, p_court uuid default null, p_played_at timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  m public.matches;
  v_my_team uuid;
  v_other_team uuid;
  v_best smallint;
  v_current jsonb;
  v_games jsonb;
  v_pending public.match_changes;
  v_id uuid;
  v_auto boolean;
  p uuid;
begin
  if v_me is null then raise exception 'Not signed in'; end if;
  if p_kind not in ('edit', 'delete') then raise exception 'Unknown change'; end if;
  select * into m from public.matches where id = p_match for update;
  if m.id is null or m.deleted_at is not null then raise exception 'Unknown match'; end if;
  if public.is_team_member(m.team_a_id, v_me) then
    v_my_team := m.team_a_id; v_other_team := m.team_b_id;
  elsif public.is_team_member(m.team_b_id, v_me) then
    v_my_team := m.team_b_id; v_other_team := m.team_a_id;
  else
    raise exception 'Only a player in this match can change it';
  end if;
  if m.status = 'voided' then raise exception 'This game was already thrown out'; end if;
  if m.status = 'needs_admin' then raise exception 'An admin is deciding this score'; end if;
  if p_kind = 'edit' and m.status = 'awaiting_confirmation' then
    raise exception 'This score is still waiting on confirmation. Use "That''s not right" to fix it';
  end if;

  select * into v_pending from public.match_changes where match_id = p_match and status = 'pending';
  if v_pending.id is not null then
    if v_pending.proposed_by_team <> v_my_team then raise exception 'Answer their change first'; end if;
    update public.match_changes set status = 'cancelled', resolved_at = now() where id = v_pending.id;
  end if;

  select best_of into v_best from public.challenges where id = m.challenge_id;
  select jsonb_agg(jsonb_build_array(team_a_score, team_b_score) order by game_number) into v_current
  from public.games where match_id = p_match;

  if p_kind = 'edit' then
    v_games := coalesce(p_games, v_current);
    perform public.match_winner(v_games, v_best);
    if p_court is not null and not exists (select 1 from public.courts where id = p_court and status = 'approved') then
      raise exception 'Pick an approved court';
    end if;
    if p_played_at is not null and p_played_at > now() + interval '15 minutes' then raise exception 'A game cannot be in the future'; end if;
    if v_games = v_current and coalesce(p_court, m.court_id) = m.court_id and coalesce(p_played_at, m.played_at) = m.played_at then
      raise exception 'Nothing changed';
    end if;
  end if;

  v_auto := not public.team_has_real_member(v_other_team);

  insert into public.match_changes (match_id, kind, games, court_id, played_at, proposed_by, proposed_by_team, status, resolved_at)
  values (p_match, p_kind, v_games, p_court, p_played_at, v_me, v_my_team,
          case when v_auto then 'applied' else 'pending' end,
          case when v_auto then now() else null end)
  returning id into v_id;

  if v_auto then
    perform public.apply_match_change(v_id);
    return 'applied';
  end if;

  for p in
    select y from public.teams t cross join lateral unnest(array[t.player_low, t.player_high]) as y
    join public.profiles pr on pr.id = y and not pr.is_placeholder and pr.deleted_at is null
    where t.id = v_other_team and y is not null
  loop
    perform public.notify(
      p, 'challenges',
      case when p_kind = 'delete' then 'Delete a game?' else 'Score change to confirm' end,
      public.first_name(v_me) || case when p_kind = 'delete' then ' wants to delete a game you played.' else ' changed a game you played. Check it.' end,
      jsonb_build_object('path', '/challenges')
    );
  end loop;
  return 'pending';
end;
$$;

create function public.respond_to_match_change(p_change uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  x public.match_changes;
  m public.matches;
begin
  select * into x from public.match_changes where id = p_change for update;
  if x.id is null then raise exception 'Unknown change'; end if;
  if x.status <> 'pending' then raise exception 'That change was already %', x.status; end if;
  select * into m from public.matches where id = x.match_id;
  if not (public.is_team_member(m.team_a_id, auth.uid()) or public.is_team_member(m.team_b_id, auth.uid()))
     or public.is_team_member(x.proposed_by_team, auth.uid()) then
    raise exception 'Only a player on the other team can answer this';
  end if;
  if p_accept then
    perform public.apply_match_change(p_change);
    update public.match_changes set status = 'accepted', resolved_at = now() where id = p_change;
  else
    update public.match_changes set status = 'declined', resolved_at = now() where id = p_change;
  end if;
  perform public.notify(
    x.proposed_by, 'challenges',
    case when p_accept then 'Change accepted' else 'Change declined' end,
    public.first_name(auth.uid()) || case when p_accept then ' accepted your change.' else ' did not accept your change. The game stays as it was.' end,
    jsonb_build_object('path', '/challenges')
  );
  return case when p_accept then 'accepted' else 'declined' end;
end;
$$;

create function public.cancel_match_change(p_change uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.match_changes set status = 'cancelled', resolved_at = now()
  where id = p_change and status = 'pending' and public.is_team_member(proposed_by_team, auth.uid());
  if not found then raise exception 'There is nothing to cancel'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Everything about one match, for its detail screen (opened by challenge id)
-- ---------------------------------------------------------------------------
-- Null if there's no played game or you aren't allowed to see it. Scores are in
-- the match's order: team A first.

create function public.match_detail(p_challenge uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  m public.matches;
  c public.challenges;
  v_member boolean;
begin
  select * into m from public.matches where challenge_id = p_challenge and deleted_at is null;
  if m.id is null then return null; end if;
  select * into c from public.challenges where id = p_challenge;
  v_member := public.is_team_member(m.team_a_id, v_me) or public.is_team_member(m.team_b_id, v_me);
  if not v_member and exists (
    select 1 from public.teams t
    join public.profiles p on p.id in (t.player_low, t.player_high)
    where t.id in (m.team_a_id, m.team_b_id)
      and (public.players_blocked(v_me, p.id) or (not p.show_record and not p.is_placeholder))
  ) then
    return null;
  end if;

  return jsonb_build_object(
    'challenge_id', c.id,
    'match_id', m.id,
    'status', m.status,
    'logged', c.logged,
    'best_of', c.best_of,
    'scheduled_for', c.proposed_time,
    'played_at', m.played_at,
    'court_id', m.court_id,
    'court_name', (select name from public.courts where id = m.court_id),
    'team_a', jsonb_build_object(
      'id', m.team_a_id, 'name', public.team_display_name(m.team_a_id),
      'players', (select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'placeholder', p.is_placeholder) order by p.display_name)
                  from public.teams t join public.profiles p on p.id in (t.player_low, t.player_high) where t.id = m.team_a_id)),
    'team_b', jsonb_build_object(
      'id', m.team_b_id, 'name', public.team_display_name(m.team_b_id),
      'players', (select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.display_name, 'placeholder', p.is_placeholder) order by p.display_name)
                  from public.teams t join public.profiles p on p.id in (t.player_low, t.player_high) where t.id = m.team_b_id)),
    'games', (select jsonb_agg(jsonb_build_array(g.team_a_score, g.team_b_score) order by g.game_number) from public.games g where g.match_id = m.id),
    'winner', case when m.winner_team_id = m.team_a_id then 'a' else 'b' end,
    'my_side', case when public.is_team_member(m.team_a_id, v_me) then 'a' when public.is_team_member(m.team_b_id, v_me) then 'b' end,
    'awaiting_side', case when m.awaiting_team_id = m.team_a_id then 'a' when m.awaiting_team_id = m.team_b_id then 'b' end,
    'submitted_by_name', (select display_name from public.profiles where id = m.submitted_by),
    'pending_change', (
      select jsonb_build_object(
        'id', x.id, 'kind', x.kind, 'games', x.games, 'court_id', x.court_id,
        'court_name', (select name from public.courts where id = x.court_id),
        'played_at', x.played_at,
        'by_name', (select display_name from public.profiles where id = x.proposed_by),
        'by_side', case when x.proposed_by_team = m.team_a_id then 'a' else 'b' end)
      from public.match_changes x where x.match_id = m.id and x.status = 'pending')
  );
end;
$$;

-- Changes to your games that are waiting on you.
create function public.my_pending_changes()
returns table (challenge_id uuid, change_id uuid, kind text, by_name text, by_team_name text, court_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, x.id, x.kind, pr.display_name, public.team_display_name(x.proposed_by_team), co.name, x.created_at
  from public.match_changes x
  join public.matches m on m.id = x.match_id and m.deleted_at is null
  join public.challenges c on c.id = m.challenge_id
  join public.profiles pr on pr.id = x.proposed_by
  join public.courts co on co.id = m.court_id
  where x.status = 'pending'
    and (
      (public.is_team_member(m.team_a_id, auth.uid()) and x.proposed_by_team <> m.team_a_id)
      or (public.is_team_member(m.team_b_id, auth.uid()) and x.proposed_by_team <> m.team_b_id)
    )
  order by x.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- my_challenges also says if a partner is still needed and if the game was logged,
-- and leaves out games that were deleted
-- ---------------------------------------------------------------------------

drop function public.my_challenges();

create function public.my_challenges()
returns table (
  challenge_id uuid,
  status public.challenge_status,
  i_challenged boolean,
  my_team_id uuid,
  my_team_name text,
  their_team_id uuid,
  their_team_name text,
  court_id uuid,
  court_name text,
  proposed_time timestamptz,
  created_at timestamptz,
  match_id uuid,
  match_status public.match_status,
  awaiting_me boolean,
  i_won boolean,
  games jsonb,
  submitted_by_name text,
  played_at timestamptz,
  best_of smallint,
  needs_partner boolean,
  logged boolean
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
         public.team_display_name(case when c.i_challenged then c.challenger_team_id else c.challenged_team_id end),
         case when c.i_challenged then c.challenged_team_id else c.challenger_team_id end,
         public.team_display_name(case when c.i_challenged then c.challenged_team_id else c.challenger_team_id end)
           || case when c.i_challenged and c.needs_partner then ' + partner TBD' else '' end,
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
         c.logged
  from mine c
  join public.courts co on co.id = c.court_id
  left join public.matches m on m.challenge_id = c.id
  left join public.profiles sp on sp.id = m.submitted_by
  order by coalesce(m.played_at, c.proposed_time) desc;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function
  public.team_has_real_member(uuid),
  public.person_ok(uuid, uuid),
  public.ensure_team(uuid, uuid),
  public.create_person(text),
  public.rename_person(uuid, text),
  public.my_people(),
  public.delete_person(uuid),
  public.repoint_team(uuid, uuid),
  public.link_person_to_account(uuid, uuid),
  public.send_challenge_to_player(uuid, uuid, uuid, timestamptz, smallint),
  public.accept_challenge_with_partner(uuid, uuid),
  public.challenges_partner_first(),
  public.log_game(uuid, timestamptz, smallint, jsonb, uuid, uuid, uuid),
  public.apply_match_change(uuid),
  public.propose_match_change(uuid, text, jsonb, uuid, timestamptz),
  public.respond_to_match_change(uuid, boolean),
  public.cancel_match_change(uuid),
  public.match_detail(uuid),
  public.my_pending_changes(),
  public.my_challenges()
from public, anon, authenticated;

grant execute on function
  public.create_person(text),
  public.rename_person(uuid, text),
  public.my_people(),
  public.delete_person(uuid),
  public.link_person_to_account(uuid, uuid),
  public.send_challenge_to_player(uuid, uuid, uuid, timestamptz, smallint),
  public.accept_challenge_with_partner(uuid, uuid),
  public.log_game(uuid, timestamptz, smallint, jsonb, uuid, uuid, uuid),
  public.propose_match_change(uuid, text, jsonb, uuid, timestamptz),
  public.respond_to_match_change(uuid, boolean),
  public.cancel_match_change(uuid),
  public.match_detail(uuid),
  public.my_pending_changes(),
  public.my_challenges()
to authenticated;

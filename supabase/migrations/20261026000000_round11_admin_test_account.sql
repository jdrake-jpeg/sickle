-- Round 11: an admin test account.
--
-- An admin can make one test player (a real login, but not an admin) and switch
-- into it from Settings to try challenges, games and chats with their own
-- account. Everything the test player does stays out of real data: it can't be
-- found in search, it isn't on any leaderboard or record, and only its admin
-- can see it or its games.
--
-- Additive. Run once, after 20261025.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column is_test boolean not null default false,
  add column test_owner uuid references public.profiles (id) on delete cascade;
alter table public.challenges add column is_test boolean not null default false;
alter table public.matches add column is_test boolean not null default false;
create unique index profiles_one_test_per_admin on public.profiles (test_owner) where is_test;

-- Is this the test player of somebody else? Then only that admin (and the test player itself) can see it.
create function public.test_hidden(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles t
    where t.id = p_profile and t.is_test
      and t.id is distinct from auth.uid()
      and t.test_owner is distinct from auth.uid()
  );
$$;

-- Is whoever is asking a test player?
create function public.is_test_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select is_test from public.profiles where id = auth.uid()), false);
$$;

-- Direct reads of profiles skip test players too (restrictive, so it applies on top of "profiles readable").
create policy "test players are private" on public.profiles as restrictive for select to authenticated
  using (not is_test or id = auth.uid() or test_owner = auth.uid());

-- Games that involve a test player are marked, so records and leaderboards can leave them out.
create function public.mark_test_challenge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.is_test := exists (
    select 1 from public.teams t
    join public.profiles p on p.id in (t.player_low, t.player_high)
    where t.id in (new.challenger_team_id, new.challenged_team_id) and p.is_test
  );
  return new;
end;
$$;
create trigger challenges_mark_test before insert on public.challenges
  for each row execute function public.mark_test_challenge();

create function public.mark_test_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.is_test := coalesce((select c.is_test from public.challenges c where c.id = new.challenge_id), false);
  return new;
end;
$$;
create trigger matches_mark_test before insert on public.matches
  for each row execute function public.mark_test_match();

-- A test player can never be made an admin.
create function public.reject_test_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_test and new.is_admin then raise exception 'The test account can''t be an admin'; end if;
  return new;
end;
$$;
create trigger profiles_no_test_admin before insert or update on public.profiles
  for each row execute function public.reject_test_admin();

-- ---------------------------------------------------------------------------
-- Records and leaderboards leave test games out
-- ---------------------------------------------------------------------------
create or replace view public.team_records as
 select t.id as team_id,
    count(m.id) filter (where m.winner_team_id = t.id) as wins,
    count(m.id) filter (where m.winner_team_id <> t.id) as losses
   from public.teams t
     left join public.matches m on m.status = 'confirmed'::public.match_status and not m.is_test and (t.id = m.team_a_id or t.id = m.team_b_id)
  group by t.id;

create or replace view public.player_records as
 select p.id as profile_id,
    count(m.id) filter (where m.winner_team_id = t.id) as wins,
    count(m.id) filter (where m.winner_team_id <> t.id) as losses
   from public.profiles p
     left join public.teams t on p.id = t.player_low or p.id = t.player_high
     left join public.matches m on m.status = 'confirmed'::public.match_status and not m.is_test and (t.id = m.team_a_id or t.id = m.team_b_id)
  group by p.id;
CREATE OR REPLACE FUNCTION public.court_leaderboard(p_court uuid, p_singles boolean)
 RETURNS TABLE(rank bigint, team_id uuid, team_name text, rating integer, wins integer, losses integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    join public.teams ta on ta.id = mm.team_a_id
    where mm.court_id = p_court and mm.status = 'confirmed' and not mm.is_test
      and (ta.player_high is null) = coalesce(p_singles, false)
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
$function$;

CREATE OR REPLACE FUNCTION public.team_crowns(p_team uuid)
 RETURNS TABLE(court_id uuid, court_name text, is_singles boolean, wins integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select c.id, c.name, t.player_high is null, s.wins
  from public.teams t
  join public.matches m on m.status = 'confirmed' and not m.is_test and t.id in (m.team_a_id, m.team_b_id)
  join public.courts c on c.id = m.court_id
  cross join lateral public.court_champion(c.id, t.player_high is null) s
  where t.id = p_team and s.team_id = t.id
    and not exists (
      select 1 from public.profiles p
      where p.id in (t.player_low, t.player_high) and not p.show_record and p.id <> auth.uid()
    )
  group by c.id, c.name, t.player_high, s.wins
  order by c.name;
$function$;

CREATE OR REPLACE FUNCTION public.team_history(p_team uuid)
 RETURNS TABLE(challenge_id uuid, played_at timestamp with time zone, court_id uuid, court_name text, opponent_id uuid, opponent_name text, won boolean, games jsonb, best_of smallint, is_singles boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select m.challenge_id, m.played_at, m.court_id, co.name,
         opp.id, public.team_display_name(opp.id),
         m.winner_team_id = p_team,
         (select jsonb_agg(
                   case when m.team_a_id = p_team
                        then jsonb_build_array(g.team_a_score, g.team_b_score)
                        else jsonb_build_array(g.team_b_score, g.team_a_score) end
                   order by g.game_number)
          from public.games g where g.match_id = m.id),
         c.best_of,
         t.player_high is null
  from public.teams t
  join public.matches m on m.status = 'confirmed' and (not m.is_test or public.is_test_user()) and t.id in (m.team_a_id, m.team_b_id)
  join public.teams opp on opp.id = case when m.team_a_id = t.id then m.team_b_id else m.team_a_id end
  join public.challenges c on c.id = m.challenge_id
  join public.courts co on co.id = m.court_id
  where t.id = p_team
    and (
      auth.uid() in (t.player_low, t.player_high)
      or (
        not public.players_blocked(auth.uid(), t.player_low)
        and not public.players_blocked(auth.uid(), t.player_high)
        and not exists (
          select 1 from public.profiles p
          where p.id in (t.player_low, t.player_high) and not p.show_record
        )
      )
    )
  order by m.played_at desc;
$function$;

CREATE OR REPLACE FUNCTION public.player_history(p_profile uuid)
 RETURNS TABLE(challenge_id uuid, played_at timestamp with time zone, court_id uuid, court_name text, team_id uuid, team_name text, with_id uuid, with_name text, opponent_id uuid, opponent_name text, won boolean, games jsonb, best_of smallint, is_singles boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select m.challenge_id, m.played_at, m.court_id, co.name,
         t.id, public.team_display_name(t.id),
         mate.id, mate.display_name,
         opp.id, public.team_display_name(opp.id),
         m.winner_team_id = t.id,
         (select jsonb_agg(
                   case when m.team_a_id = t.id
                        then jsonb_build_array(g.team_a_score, g.team_b_score)
                        else jsonb_build_array(g.team_b_score, g.team_a_score) end
                   order by g.game_number)
          from public.games g where g.match_id = m.id),
         c.best_of,
         t.player_high is null
  from public.profiles p
  join public.teams t on p.id in (t.player_low, t.player_high)
  join public.matches m on m.status = 'confirmed' and (not m.is_test or public.is_test_user()) and t.id in (m.team_a_id, m.team_b_id)
  join public.teams opp on opp.id = case when m.team_a_id = t.id then m.team_b_id else m.team_a_id end
  join public.challenges c on c.id = m.challenge_id
  join public.courts co on co.id = m.court_id
  left join public.profiles mate on mate.id = case when t.player_low = p.id then t.player_high else t.player_low end
  where p.id = p_profile
    and (p.show_record or p.id = auth.uid())
    and not public.players_blocked(auth.uid(), p.id)
  order by m.played_at desc;
$function$;

CREATE OR REPLACE FUNCTION public.match_detail(p_challenge uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if c.is_test and not v_member then return null; end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.my_rating_summary()
 RETURNS TABLE(ratings bigint, average numeric, last_30_days bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select count(*), round(avg(skill) * 2) / 2, count(*) filter (where created_at > now() - interval '30 days')
  from public.player_ratings
  where ratee_id = auth.uid()
    and not exists (select 1 from public.profiles r where r.id = rater_id and r.is_test);
$function$;


-- ---------------------------------------------------------------------------
-- Test players are left out of search and find players
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.browse_players(p_min_skill numeric DEFAULT NULL::numeric, p_max_skill numeric DEFAULT NULL::numeric, p_format text DEFAULT NULL::text)
 RETURNS TABLE(profile_id uuid, display_name text, username citext, skill_level numeric, looking_now boolean, plays_singles boolean, plays_doubles boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.id, p.display_name, p.username, p.skill_level,
         p.availability = 'looking_to_play' and p.availability_expires_at > now(),
         p.plays_singles, p.plays_doubles
  from public.profiles p
  left join public.profiles me on me.id = auth.uid()
  where auth.uid() is not null
    and p.id <> auth.uid()
    and p.deleted_at is null and not p.is_placeholder and not public.test_hidden(p.id)
    and (p_min_skill is null or p.skill_level >= p_min_skill)
    and (p_max_skill is null or p.skill_level <= p_max_skill)
    and (p_format is null or (p_format = 'singles' and p.plays_singles) or (p_format = 'doubles' and p.plays_doubles))
    and not public.players_blocked(auth.uid(), p.id)
    and not public.are_friends(auth.uid(), p.id)
  order by (p.availability = 'looking_to_play' and p.availability_expires_at > now()) desc,
           abs(coalesce(p.skill_level, 0) - coalesce(me.skill_level, 0)),
           p.display_name
  limit 60;
$function$;

CREATE OR REPLACE FUNCTION public.find_players(p_min_skill numeric DEFAULT NULL::numeric, p_max_skill numeric DEFAULT NULL::numeric, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_radius_miles double precision DEFAULT NULL::double precision, p_common_only boolean DEFAULT false, p_scope text DEFAULT 'people'::text)
 RETURNS TABLE(profile_id uuid, display_name text, username citext, skill_level numeric, looking_now boolean, plays_singles boolean, plays_doubles boolean, mutual_friends integer, is_friend boolean, distance_miles double precision)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      and p.deleted_at is null and not p.is_placeholder and not public.test_hidden(p.id)
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
$function$;

CREATE OR REPLACE FUNCTION public.similar_players(p_format text DEFAULT NULL::text)
 RETURNS TABLE(profile_id uuid, display_name text, username citext, skill_level numeric, looking_now boolean, plays_singles boolean, plays_doubles boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.id, p.display_name, p.username, p.skill_level,
         p.availability = 'looking_to_play' and p.availability_expires_at > now(),
         p.plays_singles, p.plays_doubles
  from public.profiles me
  join public.profiles p on p.id <> me.id
  where me.id = auth.uid()
    and me.skill_level is not null
    and p.deleted_at is null and not p.is_placeholder and not public.test_hidden(p.id)
    and p.skill_level is not null
    and abs(p.skill_level - me.skill_level) <= 0.5
    and (p_format is null or (p_format = 'singles' and p.plays_singles) or (p_format = 'doubles' and p.plays_doubles))
    and not public.players_blocked(me.id, p.id)
    and not public.are_friends(me.id, p.id)
  order by (p.availability = 'looking_to_play' and p.availability_expires_at > now()) desc,
           abs(p.skill_level - me.skill_level), p.display_name
  limit 30;
$function$;

CREATE OR REPLACE FUNCTION public.search_players(p_query text)
 RETURNS TABLE(profile_id uuid, display_name text, username citext, avatar_url text, skill_level numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.id, p.display_name, p.username, p.avatar_url, p.skill_level
  from public.profiles p
  where char_length(trim(p_query)) >= 2
    and p.id <> auth.uid()
    and p.deleted_at is null and not p.is_placeholder and not public.test_hidden(p.id)
    and (p.username::text ilike replace(replace(trim(p_query), '%', ''), '_', '\_') || '%'
         or p.display_name ilike '%' || replace(replace(trim(p_query), '%', ''), '_', '\_') || '%')
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
  order by p.username
  limit 20;
$function$;

CREATE OR REPLACE FUNCTION public.nearby_players(p_lat double precision, p_lng double precision, p_radius_miles double precision DEFAULT 5, p_min_skill numeric DEFAULT NULL::numeric, p_max_skill numeric DEFAULT NULL::numeric, p_format text DEFAULT NULL::text)
 RETURNS TABLE(profile_id uuid, display_name text, username citext, avatar_url text, skill_level numeric, looking_until timestamp with time zone, distance_miles double precision, plays_singles boolean, plays_doubles boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.id, p.display_name, p.username, p.avatar_url, p.skill_level, p.availability_expires_at,
         greatest(0.5, round((public.distance_miles(p_lat, p_lng, l.approx_lat, l.approx_lng) * 2)::numeric) / 2)::double precision,
         p.plays_singles, p.plays_doubles
  from public.profiles p
  join public.player_locations l on l.profile_id = p.id
  where p.id <> auth.uid()
    and p.deleted_at is null
    and not public.test_hidden(p.id)
    and p.availability = 'looking_to_play'
    and p.availability_expires_at > now()
    and public.distance_miles(p_lat, p_lng, l.approx_lat, l.approx_lng) <= least(p_radius_miles, 50)
    and (p_min_skill is null or p.skill_level >= p_min_skill)
    and (p_max_skill is null or p.skill_level <= p_max_skill)
    and (p_format is null or (p_format = 'singles' and p.plays_singles) or (p_format = 'doubles' and p.plays_doubles))
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
  order by 7 asc
  limit 100;
$function$;

CREATE OR REPLACE FUNCTION public.recent_opponents()
 RETURNS TABLE(profile_id uuid, display_name text, username citext, skill_level numeric, last_seen timestamp with time zone, played boolean, relation text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  where p.id <> auth.uid() and not public.players_blocked(auth.uid(), p.id) and not public.test_hidden(p.id)
  group by p.id
  order by max(x.at) desc
  limit 50;
$function$;

CREATE OR REPLACE FUNCTION public.recent_players()
 RETURNS TABLE(profile_id uuid, display_name text, is_person boolean, last_played timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.id, p.display_name, p.is_placeholder, max(m.played_at)
  from public.matches m
  join public.teams mine on mine.id in (m.team_a_id, m.team_b_id) and auth.uid() in (mine.player_low, mine.player_high)
  join public.teams t on t.id in (m.team_a_id, m.team_b_id)
  join public.profiles p on p.id in (t.player_low, t.player_high)
  where m.deleted_at is null
    and p.id <> auth.uid()
    and p.deleted_at is null
    and not public.test_hidden(p.id)
    and (not p.is_placeholder or (p.owner_id = auth.uid() and p.linked_to is null))
    and not public.players_blocked(auth.uid(), p.id)
  group by p.id, p.display_name, p.is_placeholder
  order by max(m.played_at) desc
  limit 30;
$function$;


-- ---------------------------------------------------------------------------
-- my_challenges says which games are test games
-- ---------------------------------------------------------------------------
drop function public.my_challenges();

CREATE OR REPLACE FUNCTION public.my_challenges()
 RETURNS TABLE(challenge_id uuid, status challenge_status, i_challenged boolean, my_team_id uuid, my_team_name text, their_team_id uuid, their_team_name text, court_id uuid, court_name text, proposed_time timestamp with time zone, created_at timestamp with time zone, match_id uuid, match_status match_status, awaiting_me boolean, i_won boolean, games jsonb, submitted_by_name text, played_at timestamp with time zone, best_of smallint, needs_partner boolean, logged boolean, challenger_needs_partner boolean, is_test boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
         public.team_display_name(case when c.i_challenged then c.challenger_team_id else c.challenged_team_id end)
           || case when c.i_challenged and c.challenger_needs_partner then ' + partner TBD' else '' end,
         case when c.i_challenged then c.challenged_team_id else c.challenger_team_id end,
         public.team_display_name(case when c.i_challenged then c.challenged_team_id else c.challenger_team_id end)
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
         c.is_test
  from mine c
  join public.courts co on co.id = c.court_id
  left join public.matches m on m.challenge_id = c.id
  left join public.profiles sp on sp.id = m.submitted_by
  order by coalesce(m.played_at, c.proposed_time) desc;
$function$;


-- ---------------------------------------------------------------------------
-- The test account
-- ---------------------------------------------------------------------------

create table public.admin_test_accounts (
  admin_id uuid primary key references public.profiles (id) on delete cascade,
  test_id uuid not null references public.profiles (id) on delete cascade,
  email text not null,
  password text not null
);
alter table public.admin_test_accounts enable row level security;
revoke all on public.admin_test_accounts from authenticated, anon;

-- The login for your own test player. Only the admin it belongs to gets it back.
create function public.admin_test_account()
returns table (test_id uuid, display_name text, email text, password text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Only admins have a test account'; end if;
  return query
  select a.test_id, p.display_name, a.email, a.password
  from public.admin_test_accounts a
  join public.profiles p on p.id = a.test_id
  where a.admin_id = auth.uid();
end;
$$;

-- Makes the test player (once per admin): a login, a profile that is not an admin, and a friendship with you.
create function public.admin_create_test_account()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid := gen_random_uuid();
  v_short text;
  v_email text;
  v_pw text := replace(gen_random_uuid()::text, '-', '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  v_cols text[] := array[]::text[];
  v_vals text[] := array[]::text[];
  v_has_ident_pid boolean;
begin
  if not public.is_admin() then raise exception 'Only admins can make a test account'; end if;
  if exists (select 1 from public.admin_test_accounts where admin_id = v_me) then
    return (select a.test_id from public.admin_test_accounts a where a.admin_id = v_me);
  end if;
  v_short := substr(replace(v_id::text, '-', ''), 1, 8);
  v_email := 'sickle.test.' || v_short || '@example.com';

  -- The login. On Supabase this is a real, confirmed email and password account.
  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'encrypted_password') then
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
            extensions.crypt(v_pw, extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
    if to_regclass('auth.identities') is not null then
      select exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id') into v_has_ident_pid;
      if v_has_ident_pid then
        insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        values (gen_random_uuid(), v_id, v_id::text, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());
      else
        insert into auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        values (v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now());
      end if;
    end if;
  else
    insert into auth.users (id) values (v_id);
  end if;

  insert into public.profiles (id, username, display_name, skill_level, is_test, test_owner)
  values (v_id, 'sickletest' || v_short, 'Test Player', 3.5, true, v_me);

  insert into public.friendships (requester_id, addressee_id, status, accepted_at)
  values (v_me, v_id, 'accepted', now());
  perform public.ensure_team(v_id, null);

  insert into public.admin_test_accounts (admin_id, test_id, email, password) values (v_me, v_id, v_email, v_pw);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function
  public.test_hidden(uuid), public.is_test_user(),
  public.mark_test_challenge(), public.mark_test_match(),
  public.admin_test_account(), public.admin_create_test_account(),
  public.my_challenges()
from public, anon, authenticated;

grant execute on function
  public.test_hidden(uuid), public.is_test_user(),
  public.admin_test_account(), public.admin_create_test_account(),
  public.my_challenges()
to authenticated;

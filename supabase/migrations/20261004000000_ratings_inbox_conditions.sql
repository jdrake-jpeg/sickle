-- Private player ratings, friend inboxes, court conditions, and the read
-- functions the Challenges, match and Profile screens use.

-- ---------------------------------------------------------------------------
-- Reads for the app's own challenges, matches and teams
-- ---------------------------------------------------------------------------

-- Every challenge you're part of, with its match if a score was entered.
-- Scores are [your team, their team] so the app never has to flip them.
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
  played_at timestamptz
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
    where public.is_team_member(c.challenger_team_id, auth.uid())
       or public.is_team_member(c.challenged_team_id, auth.uid())
  )
  select c.id, c.status, c.i_challenged,
         case when c.i_challenged then c.challenger_team_id else c.challenged_team_id end,
         public.team_display_name(case when c.i_challenged then c.challenger_team_id else c.challenged_team_id end),
         case when c.i_challenged then c.challenged_team_id else c.challenger_team_id end,
         public.team_display_name(case when c.i_challenged then c.challenged_team_id else c.challenger_team_id end),
         c.court_id, co.name, c.proposed_time, c.created_at,
         m.id, m.status,
         coalesce(m.awaiting_team_id = case when c.i_challenged then c.challenger_team_id else c.challenged_team_id end, false),
         m.winner_team_id = case when c.i_challenged then c.challenger_team_id else c.challenged_team_id end,
         (select jsonb_agg(case when c.i_challenged then jsonb_build_array(g.team_a_score, g.team_b_score)
                                else jsonb_build_array(g.team_b_score, g.team_a_score) end order by g.game_number)
          from public.games g where g.match_id = m.id),
         sp.display_name,
         m.played_at
  from mine c
  join public.courts co on co.id = c.court_id
  left join public.matches m on m.challenge_id = c.id
  left join public.profiles sp on sp.id = m.submitted_by
  order by coalesce(m.played_at, c.proposed_time) desc;
$$;

-- Your teams with their records.
create function public.my_teams()
returns table (team_id uuid, team_name text, partner_id uuid, partner_name text, wins bigint, losses bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, public.team_display_name(t.id),
         p.id, p.display_name,
         coalesce(r.wins, 0), coalesce(r.losses, 0)
  from public.teams t
  join public.profiles p on p.id = case when t.player_low = auth.uid() then t.player_high else t.player_low end
  left join public.team_records r on r.team_id = t.id
  where auth.uid() in (t.player_low, t.player_high)
  order by t.created_at;
$$;

-- Another player's teams, so you can challenge one.
create function public.player_teams(p_profile uuid)
returns table (team_id uuid, team_name text, wins bigint, losses bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, public.team_display_name(t.id), coalesce(r.wins, 0), coalesce(r.losses, 0)
  from public.teams t
  left join public.team_records r on r.team_id = t.id
  where p_profile in (t.player_low, t.player_high)
    and not public.players_blocked(auth.uid(), t.player_low)
    and not public.players_blocked(auth.uid(), t.player_high)
  order by t.created_at;
$$;

-- ---------------------------------------------------------------------------
-- Private player ratings
-- ---------------------------------------------------------------------------
-- After a confirmed match, anyone who played in it can rate the level each
-- other player really played at. Only the rated player (and the rater) can
-- see it. Nothing here is public or changes rankings.

create table public.player_ratings (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  rater_id uuid not null references public.profiles (id) on delete cascade,
  ratee_id uuid not null references public.profiles (id) on delete cascade,
  skill numeric(2, 1) not null check (skill between 1.0 and 6.0 and skill * 2 = round(skill * 2)),
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  unique (match_id, rater_id, ratee_id),
  check (rater_id <> ratee_id)
);
create index player_ratings_ratee_idx on public.player_ratings (ratee_id, created_at desc);

alter table public.player_ratings enable row level security;
create policy "own ratings" on public.player_ratings for select to authenticated
  using (auth.uid() in (rater_id, ratee_id));
revoke insert, update, delete on public.player_ratings from authenticated, anon;

-- The four players in a match.
create function public.match_players(p_match uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select unnest(array[a.player_low, a.player_high, b.player_low, b.player_high])
  from public.matches m
  join public.teams a on a.id = m.team_a_id
  join public.teams b on b.id = m.team_b_id
  where m.id = p_match;
$$;

-- Rates the level another player played at in a match you both played.
-- Rating again replaces your earlier rating.
create function public.rate_player(p_match uuid, p_player uuid, p_skill numeric, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_match public.matches;
begin
  select * into v_match from public.matches where id = p_match;
  if v_match.id is null then raise exception 'Unknown match'; end if;
  if v_match.status <> 'confirmed' then raise exception 'You can rate players once both teams confirm the score'; end if;
  if v_match.resolved_at < now() - interval '14 days' then raise exception 'Ratings close 14 days after a match'; end if;
  if v_me not in (select public.match_players(p_match)) then raise exception 'Only players in this match can rate'; end if;
  if p_player not in (select public.match_players(p_match)) or p_player = v_me then
    raise exception 'Pick another player from this match';
  end if;
  if p_skill is null or p_skill not between 1.0 and 6.0 or p_skill * 2 <> round(p_skill * 2) then
    raise exception 'Pick a level from 1.0 to 6.0';
  end if;

  insert into public.player_ratings (match_id, rater_id, ratee_id, skill, note)
  values (p_match, v_me, p_player, p_skill, nullif(btrim(p_note), ''))
  on conflict (match_id, rater_id, ratee_id)
  do update set skill = excluded.skill, note = excluded.note, created_at = now();
end;
$$;

-- The other players in a match you played, with the level you rated each.
create function public.match_people(p_match uuid)
returns table (profile_id uuid, display_name text, teammate boolean, my_rating numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name,
         exists (
           select 1 from public.matches m join public.teams t on t.id in (m.team_a_id, m.team_b_id)
           where m.id = p_match and auth.uid() in (t.player_low, t.player_high) and p.id in (t.player_low, t.player_high)
         ),
         (select r.skill from public.player_ratings r where r.match_id = p_match and r.rater_id = auth.uid() and r.ratee_id = p.id)
  from public.profiles p
  where p.id in (select public.match_players(p_match))
    and p.id <> auth.uid()
    and auth.uid() in (select public.match_players(p_match))
  order by 3 desc, 2;
$$;

-- What other players think your level is. Private to you.
create function public.my_rating_summary()
returns table (ratings bigint, average numeric, last_30_days bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*), round(avg(skill) * 2) / 2, count(*) filter (where created_at > now() - interval '30 days')
  from public.player_ratings
  where ratee_id = auth.uid();
$$;

-- Ratings you've received or given, newest first, with names.
create function public.my_ratings()
returns table (id uuid, match_id uuid, received boolean, other_id uuid, other_name text, skill numeric, note text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.match_id, r.ratee_id = auth.uid(),
         case when r.ratee_id = auth.uid() then r.rater_id else r.ratee_id end,
         p.display_name, r.skill, r.note, r.created_at
  from public.player_ratings r
  join public.profiles p on p.id = case when r.ratee_id = auth.uid() then r.rater_id else r.ratee_id end
  where auth.uid() in (r.rater_id, r.ratee_id)
  order by r.created_at desc
  limit 200;
$$;

-- ---------------------------------------------------------------------------
-- Friend inbox
-- ---------------------------------------------------------------------------
-- Everything between you and one friend: games you've challenged each other
-- to (or played together) and ratings you've sent each other.

create function public.friend_activity(p_friend uuid)
returns table (
  kind text,
  at timestamptz,
  challenge_id uuid,
  challenge_status public.challenge_status,
  match_id uuid,
  match_status public.match_status,
  my_team_name text,
  their_team_name text,
  same_team boolean,
  court_name text,
  proposed_time timestamptz,
  skill numeric,
  note text,
  from_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select 'game', coalesce(m.played_at, c.created_at), c.id, c.status, m.id, m.status,
         public.team_display_name(case when public.is_team_member(c.challenger_team_id, auth.uid()) then c.challenger_team_id else c.challenged_team_id end),
         public.team_display_name(case when public.is_team_member(c.challenger_team_id, auth.uid()) then c.challenged_team_id else c.challenger_team_id end),
         (public.is_team_member(c.challenger_team_id, auth.uid()) and public.is_team_member(c.challenger_team_id, p_friend))
           or (public.is_team_member(c.challenged_team_id, auth.uid()) and public.is_team_member(c.challenged_team_id, p_friend)),
         co.name, c.proposed_time, null::numeric, null::text,
         public.is_team_member(c.challenger_team_id, auth.uid())
  from public.challenges c
  join public.courts co on co.id = c.court_id
  left join public.matches m on m.challenge_id = c.id
  where (public.is_team_member(c.challenger_team_id, auth.uid()) or public.is_team_member(c.challenged_team_id, auth.uid()))
    and (public.is_team_member(c.challenger_team_id, p_friend) or public.is_team_member(c.challenged_team_id, p_friend))
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester_id = auth.uid() and f.addressee_id = p_friend) or (f.requester_id = p_friend and f.addressee_id = auth.uid()))
    )
  union all
  select 'rating', r.created_at, null, null, r.match_id, null, null, null, null, null, null, r.skill, r.note, r.rater_id = auth.uid()
  from public.player_ratings r
  where (r.rater_id = auth.uid() and r.ratee_id = p_friend) or (r.rater_id = p_friend and r.ratee_id = auth.uid())
  order by 2 desc
  limit 100;
$$;

-- ---------------------------------------------------------------------------
-- Court conditions
-- ---------------------------------------------------------------------------
-- Players say how a court is right now. Reports older than 6 hours stop
-- showing, so the latest one is always fresh.

create type public.court_condition as enum ('good', 'wet', 'windy', 'icy', 'crowded');

create table public.court_condition_reports (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references public.courts (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  condition public.court_condition not null,
  note text check (char_length(note) <= 140),
  created_at timestamptz not null default now()
);
create index court_condition_reports_court_idx on public.court_condition_reports (court_id, created_at desc);

alter table public.court_condition_reports enable row level security;
create policy "condition reports readable" on public.court_condition_reports for select to authenticated using (true);
revoke insert, update, delete on public.court_condition_reports from authenticated, anon;

create function public.report_court_condition(p_court uuid, p_condition public.court_condition, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null or not exists (select 1 from public.profiles where id = v_me) then
    raise exception 'Finish setting up your profile first';
  end if;
  if not exists (select 1 from public.courts where id = p_court and status = 'approved') then
    raise exception 'Unknown court';
  end if;
  if exists (
    select 1 from public.court_condition_reports
    where court_id = p_court and reporter_id = v_me and created_at > now() - interval '10 minutes'
  ) then
    raise exception 'You just reported this court. Try again in a few minutes';
  end if;
  insert into public.court_condition_reports (court_id, reporter_id, condition, note)
  values (p_court, v_me, p_condition, nullif(btrim(p_note), ''));
end;
$$;

-- Fresh reports (last 6 hours) for one court, newest first.
create function public.court_conditions(p_court uuid)
returns table (condition public.court_condition, note text, reporter_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.condition, r.note, p.display_name, r.created_at
  from public.court_condition_reports r
  join public.profiles p on p.id = r.reporter_id
  where r.court_id = p_court and r.created_at > now() - interval '6 hours'
  order by r.created_at desc
  limit 20;
$$;

-- The latest fresh report for every court, for the courts list.
create function public.latest_court_conditions()
returns table (court_id uuid, condition public.court_condition, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (r.court_id) r.court_id, r.condition, r.created_at
  from public.court_condition_reports r
  where r.created_at > now() - interval '6 hours'
  order by r.court_id, r.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function
  public.my_challenges(),
  public.my_teams(),
  public.player_teams(uuid),
  public.match_players(uuid),
  public.rate_player(uuid, uuid, numeric, text),
  public.match_people(uuid),
  public.my_rating_summary(),
  public.my_ratings(),
  public.friend_activity(uuid),
  public.report_court_condition(uuid, public.court_condition, text),
  public.court_conditions(uuid),
  public.latest_court_conditions()
from public, anon, authenticated;
grant execute on function
  public.my_challenges(),
  public.my_teams(),
  public.player_teams(uuid),
  public.rate_player(uuid, uuid, numeric, text),
  public.match_people(uuid),
  public.my_rating_summary(),
  public.my_ratings(),
  public.friend_activity(uuid),
  public.report_court_condition(uuid, public.court_condition, text),
  public.court_conditions(uuid),
  public.latest_court_conditions()
to authenticated;

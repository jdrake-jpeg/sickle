-- Round 10:
--   * logged games count right away, and anyone in the game can fix or delete them
--   * preferred times are a from time and an until time
--   * usernames can be changed again (still unique)
--   * a doubles challenge can be sent before you know your partner; you pick them
--     when you enter the score
--   * a person you added by name can be linked to any real account
--   * profile pictures (storage) and reports for inappropriate ones, which
--     admins review
--   * removed courts are remembered so they don't come back as gray pins
--   * people you played with before, for the log a game picker
--
-- Additive. Run once, after 20261024.

-- ---------------------------------------------------------------------------
-- Preferred times: from a start to an end (the old 2 hour window still works)
-- ---------------------------------------------------------------------------

create or replace function public.valid_preferred_windows(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  v jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  for k, v in select * from jsonb_each(p) loop
    if k not in ('0', '1', '2', '3', '4', '5', '6') then return false; end if;
    if jsonb_typeof(v) <> 'number' then return false; end if;
    if (v #>> '{}')::numeric <> floor((v #>> '{}')::numeric) then return false; end if;
    if (v #>> '{}')::integer not between 0 and 1410 then return false; end if;
  end loop;
  return true;
end;
$$;

create function public.valid_preferred_ends(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  v jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  for k, v in select * from jsonb_each(p) loop
    if k not in ('0', '1', '2', '3', '4', '5', '6') then return false; end if;
    if jsonb_typeof(v) <> 'number' then return false; end if;
    if (v #>> '{}')::numeric <> floor((v #>> '{}')::numeric) then return false; end if;
    if (v #>> '{}')::integer not between 30 and 1440 then return false; end if;
  end loop;
  return true;
end;
$$;

alter table public.profiles
  add column preferred_ends jsonb not null default '{}'
    check (public.valid_preferred_ends(preferred_ends));
grant update (preferred_ends) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Usernames can be changed (the unique rule and the format check still apply)
-- ---------------------------------------------------------------------------

grant update (username) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Logged games count right away. Anyone who played can fix or delete them.
-- ---------------------------------------------------------------------------

create or replace function public.log_game(
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
    if not public.person_ok(v_me, who) then raise exception 'Everyone has to be a real player or someone you added'; end if;
  end loop;
  if p_partner is not null and (p_partner = p_opp1 or p_partner = p_opp2 or p_opp1 = p_opp2) then
    raise exception 'Each player can only be in the game once';
  end if;

  v_winner := public.match_winner(p_games, p_best_of);

  v_mine := public.ensure_team(v_me, p_partner);
  v_theirs := public.ensure_team(p_opp1, p_opp2);
  if public.teams_blocked(v_mine, v_theirs) then raise exception 'You cannot log a game with this team'; end if;

  -- Logged games count right away. Anyone in the game can fix the score later.
  v_auto := true;

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

  -- Tell the real players in the game, so they can fix it if it is wrong.
  for who in
    select y from public.teams t cross join lateral unnest(array[t.player_low, t.player_high]) as y
    join public.profiles pr on pr.id = y and not pr.is_placeholder and pr.deleted_at is null
    where t.id in (v_mine, v_theirs) and y is not null and y <> v_me
  loop
    perform public.notify(
      who, 'challenges', 'A game was logged with you',
      public.first_name(v_me) || ' logged a game: ' || public.team_display_name(v_mine) || ' vs ' || public.team_display_name(v_theirs) || '. Open it to fix the score if it is off.',
      jsonb_build_object('path', '/game/' || v_challenge::text)
    );
  end loop;

  return v_challenge;
end;
$$;

create or replace function public.propose_match_change(
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
  v_logged boolean;
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

  select logged into v_logged from public.challenges where id = m.challenge_id;
  -- Logged games can be fixed or deleted by anyone who played, right away.
  v_auto := coalesce(v_logged, false) or not public.team_has_real_member(v_other_team);

  insert into public.match_changes (match_id, kind, games, court_id, played_at, proposed_by, proposed_by_team, status, resolved_at)
  values (p_match, p_kind, v_games, p_court, p_played_at, v_me, v_my_team,
          case when v_auto then 'applied' else 'pending' end,
          case when v_auto then now() else null end)
  returning id into v_id;

  if v_auto then
    perform public.apply_match_change(v_id);
    -- Let the other real players know it changed.
    for p in
      select y from public.teams t cross join lateral unnest(array[t.player_low, t.player_high]) as y
      join public.profiles pr on pr.id = y and not pr.is_placeholder and pr.deleted_at is null
      where t.id in (m.team_a_id, m.team_b_id) and y is not null and y <> v_me
    loop
      perform public.notify(
        p, 'challenges',
        case when p_kind = 'delete' then 'A game was deleted' else 'A game was changed' end,
        public.first_name(v_me) || case when p_kind = 'delete' then ' deleted a game you played.' else ' fixed the score of a game you played.' end,
        jsonb_build_object('path', '/challenges')
      );
    end loop;
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

create or replace function public.link_person_to_account(p_person uuid, p_account uuid)
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
  if public.players_blocked(v_me, p_account) then
    raise exception 'You can''t link to this player';
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

-- Anyone real (not blocked either way) can be picked as a partner or opponent, so you
-- can log a game with someone you aren't friends with. Your own made up people still work.
create or replace function public.person_ok(p_me uuid, p_other uuid)
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
        or (not p.is_placeholder and not public.players_blocked(p_me, p_other))
      )
  );
$$;

-- Moving a team in one statement, so a game's winner never points at a team it no longer has.
create or replace function public.repoint_team(p_old uuid, p_new uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.challenges
  set challenger_team_id = case when challenger_team_id = p_old then p_new else challenger_team_id end,
      challenged_team_id = case when challenged_team_id = p_old then p_new else challenged_team_id end
  where p_old in (challenger_team_id, challenged_team_id);
  update public.matches
  set team_a_id = case when team_a_id = p_old then p_new else team_a_id end,
      team_b_id = case when team_b_id = p_old then p_new else team_b_id end,
      winner_team_id = case when winner_team_id = p_old then p_new else winner_team_id end,
      awaiting_team_id = case when awaiting_team_id = p_old then p_new else awaiting_team_id end
  where p_old in (team_a_id, team_b_id, winner_team_id, awaiting_team_id);
  update public.score_proposals set team_id = p_new where team_id = p_old;
  update public.match_confirmations set team_id = p_new where team_id = p_old;
  update public.match_changes set proposed_by_team = p_new where proposed_by_team = p_old;
end;
$$;

-- Logged games that were waiting on a confirmation count now.
update public.matches m
set status = 'confirmed', awaiting_team_id = null, resolved_at = coalesce(m.resolved_at, now()), updated_at = now()
from public.challenges c
where c.id = m.challenge_id and c.logged and m.status = 'awaiting_confirmation';
update public.challenges set status = 'completed', updated_at = now()
where logged and status = 'accepted'
  and exists (select 1 from public.matches m where m.challenge_id = challenges.id and m.status = 'confirmed');

-- ---------------------------------------------------------------------------
-- A doubles challenge before you know your partner
-- ---------------------------------------------------------------------------

alter table public.challenges add column challenger_needs_partner boolean not null default false;

create or replace function public.send_challenge_to_player(
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
  if v_mine.id is null then raise exception 'Pick your team'; end if;
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

  -- Your singles team here means you are not sure who your partner is yet.
  insert into public.challenges (challenger_team_id, challenged_team_id, court_id, proposed_time, created_by, best_of, needs_partner, challenger_needs_partner)
  values (p_my_team, v_theirs, p_court, p_time, v_me, p_best_of, true, v_mine.player_high is null)
  returning id into v_id;
  return v_id;
end;
$$;

-- Name your partner for a challenge you sent without one.
create function public.set_challenge_partner(p_challenge uuid, p_partner uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_c public.challenges;
  v_other public.teams;
  v_team uuid;
begin
  select * into v_c from public.challenges where id = p_challenge for update;
  if v_c.id is null then raise exception 'Unknown challenge'; end if;
  if not v_c.challenger_needs_partner then raise exception 'This challenge already has your team'; end if;
  if v_c.status not in ('pending', 'accepted') or exists (select 1 from public.matches where challenge_id = p_challenge) then
    raise exception 'This challenge is closed';
  end if;
  if not public.is_team_member(v_c.challenger_team_id, v_me) then raise exception 'Only the player who sent it can do this'; end if;
  if p_partner is null or p_partner = v_me then raise exception 'Pick a partner'; end if;
  if not public.person_ok(v_me, p_partner) then raise exception 'Your partner has to be a real player or someone you added'; end if;
  select * into v_other from public.teams where id = v_c.challenged_team_id;
  if p_partner in (v_other.player_low, v_other.player_high) then raise exception 'A player cannot be on both teams'; end if;

  v_team := public.ensure_team(v_me, p_partner);
  if public.teams_blocked(v_team, v_c.challenged_team_id) then raise exception 'You cannot play this team'; end if;
  update public.challenges
  set challenger_team_id = v_team, challenger_needs_partner = false, updated_at = now()
  where id = p_challenge;
  return v_team;
end;
$$;

create or replace function public.submit_match_result(
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
  if v_c.challenger_needs_partner or v_c.needs_partner then raise exception 'Pick your partner before entering the score'; end if;
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
  logged boolean,
  challenger_needs_partner boolean
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
         c.challenger_needs_partner
  from mine c
  join public.courts co on co.id = c.court_id
  left join public.matches m on m.challenge_id = c.id
  left join public.profiles sp on sp.id = m.submitted_by
  order by coalesce(m.played_at, c.proposed_time) desc;
$$;

-- ---------------------------------------------------------------------------
-- People you played with before (for the log a game picker)
-- ---------------------------------------------------------------------------

create function public.recent_players()
returns table (profile_id uuid, display_name text, is_person boolean, last_played timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.is_placeholder, max(m.played_at)
  from public.matches m
  join public.teams mine on mine.id in (m.team_a_id, m.team_b_id) and auth.uid() in (mine.player_low, mine.player_high)
  join public.teams t on t.id in (m.team_a_id, m.team_b_id)
  join public.profiles p on p.id in (t.player_low, t.player_high)
  where m.deleted_at is null
    and p.id <> auth.uid()
    and p.deleted_at is null
    and (not p.is_placeholder or (p.owner_id = auth.uid() and p.linked_to is null))
    and not public.players_blocked(auth.uid(), p.id)
  group by p.id, p.display_name, p.is_placeholder
  order by max(m.played_at) desc
  limit 30;
$$;

-- ---------------------------------------------------------------------------
-- Profile pictures
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('storage.objects') is not null then
    insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;
    execute 'create policy "avatars are public" on storage.objects for select using (bucket_id = ''avatars'')';
    execute 'create policy "upload own avatar" on storage.objects for insert to authenticated with check (bucket_id = ''avatars'' and (storage.foldername(name))[1] = auth.uid()::text)';
    execute 'create policy "replace own avatar" on storage.objects for update to authenticated using (bucket_id = ''avatars'' and (storage.foldername(name))[1] = auth.uid()::text)';
    execute 'create policy "delete own avatar" on storage.objects for delete to authenticated using (bucket_id = ''avatars'' and (storage.foldername(name))[1] = auth.uid()::text)';
  else
    raise notice 'storage is not available here, so profile pictures need the avatars bucket made in Supabase';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Reports go to admins, like new court requests
-- ---------------------------------------------------------------------------

alter table public.reports
  add column kind text not null default 'profile' check (kind in ('profile', 'avatar')),
  add column resolved_at timestamptz,
  add column resolved_by uuid references public.profiles (id) on delete set null;

create function public.admin_reports()
returns table (
  report_id uuid, kind text, reason text, created_at timestamptz,
  reporter_id uuid, reporter_name text,
  reported_id uuid, reported_name text, reported_username text, reported_avatar text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Only admins can see reports'; end if;
  return query
  select r.id, r.kind, r.reason, r.created_at,
         r.reporter_id, rp.display_name,
         r.reported_profile_id, xp.display_name, xp.username::text, xp.avatar_url
  from public.reports r
  join public.profiles rp on rp.id = r.reporter_id
  left join public.profiles xp on xp.id = r.reported_profile_id
  where r.resolved_at is null
  order by r.created_at desc
  limit 100;
end;
$$;

create function public.admin_report_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.is_admin() then (select count(*)::int from public.reports where resolved_at is null) else 0 end;
$$;

-- Close a report. For a profile picture report an admin can also take the picture down.
create function public.admin_resolve_report(p_report uuid, p_remove_avatar boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_r public.reports;
begin
  if not public.is_admin() then raise exception 'Only admins can close reports'; end if;
  select * into v_r from public.reports where id = p_report for update;
  if v_r.id is null then raise exception 'Unknown report'; end if;
  if coalesce(p_remove_avatar, false) and v_r.reported_profile_id is not null then
    update public.profiles set avatar_url = null where id = v_r.reported_profile_id;
  end if;
  update public.reports set resolved_at = now(), resolved_by = auth.uid() where id = p_report;
end;
$$;

-- ---------------------------------------------------------------------------
-- Courts an admin removed don't come back as gray pins
-- ---------------------------------------------------------------------------

create table public.removed_court_spots (
  id uuid primary key default gen_random_uuid(),
  lat double precision not null,
  lng double precision not null,
  google_place_id text,
  removed_at timestamptz not null default now()
);
alter table public.removed_court_spots enable row level security;
revoke all on public.removed_court_spots from authenticated, anon;

-- Every removed or rejected court, so the map can leave its spot out.
create function public.removed_spots()
returns table (lat double precision, lng double precision, google_place_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.lat, r.lng, r.google_place_id from public.removed_court_spots r
  union
  select c.lat, c.lng, c.google_place_id from public.courts c where c.status = 'rejected' and not c.is_private;
$$;

create or replace function public.admin_remove_court(p_court uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.courts;
begin
  if not public.is_admin() then raise exception 'Only admins can remove courts'; end if;
  select * into c from public.courts where id = p_court;
  if c.id is null then raise exception 'Unknown court'; end if;

  if not c.is_private then
    insert into public.removed_court_spots (lat, lng, google_place_id) values (c.lat, c.lng, c.google_place_id);
  end if;

  if exists (select 1 from public.challenges where court_id = p_court)
     or exists (select 1 from public.matches where court_id = p_court)
     or (c.source = 'map' and c.google_place_id is not null) then
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

-- Admins can say whether a court has lights, and until when.
create function public.admin_set_court_lights(p_court uuid, p_has_lights boolean, p_until smallint default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Only admins can change this'; end if;
  if p_until is not null and p_until not between 0 and 24 then raise exception 'Pick an hour from 0 to 24'; end if;
  update public.courts
  set has_lights = p_has_lights,
      lights_until = case when p_has_lights then p_until else null end,
      lights_updated_by = auth.uid(), lights_updated_at = now()
  where id = p_court;
  if not found then raise exception 'Unknown court'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke execute on function
  public.log_game(uuid, timestamptz, smallint, jsonb, uuid, uuid, uuid),
  public.propose_match_change(uuid, text, jsonb, uuid, timestamptz),
  public.link_person_to_account(uuid, uuid),
  public.send_challenge_to_player(uuid, uuid, uuid, timestamptz, smallint),
  public.set_challenge_partner(uuid, uuid),
  public.submit_match_result(uuid, jsonb, timestamptz, uuid),
  public.my_challenges(),
  public.recent_players(),
  public.admin_reports(),
  public.admin_report_count(),
  public.admin_resolve_report(uuid, boolean),
  public.removed_spots(),
  public.admin_remove_court(uuid),
  public.admin_set_court_lights(uuid, boolean, smallint)
from public, anon, authenticated;

grant execute on function
  public.log_game(uuid, timestamptz, smallint, jsonb, uuid, uuid, uuid),
  public.propose_match_change(uuid, text, jsonb, uuid, timestamptz),
  public.link_person_to_account(uuid, uuid),
  public.send_challenge_to_player(uuid, uuid, uuid, timestamptz, smallint),
  public.set_challenge_partner(uuid, uuid),
  public.submit_match_result(uuid, jsonb, timestamptz, uuid),
  public.my_challenges(),
  public.recent_players(),
  public.admin_reports(),
  public.admin_report_count(),
  public.admin_resolve_report(uuid, boolean),
  public.removed_spots(),
  public.admin_remove_court(uuid),
  public.admin_set_court_lights(uuid, boolean, smallint)
to authenticated;

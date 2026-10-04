-- A challenge can be one game or best of 3 (the challenger picks).
--
--   * challenges.best_of is 1 or 3. Every existing challenge stays 3.
--   * send_challenge takes an optional last argument for it (default 3), so
--     older app builds that send four arguments keep making best of 3 matches.
--   * submit_match_result and dispute_match_result check the score against the
--     challenge's own length.
--   * my_challenges also returns best_of.

alter table public.challenges add column best_of smallint not null default 3 check (best_of in (1, 3));

-- The winner of a match ('a' or 'b') for the given length. Best of 3 uses the
-- same rules as before; a one game match has exactly one valid game.
create function public.match_winner(p_games jsonb, p_best_of smallint)
returns text
language plpgsql
immutable
as $$
declare
  v_a smallint;
  v_b smallint;
begin
  if p_best_of = 3 then return public.best_of_three_winner(p_games); end if;
  if p_best_of <> 1 then raise exception 'A match is one game or best of 3'; end if;

  if p_games is null or jsonb_typeof(p_games) <> 'array' then raise exception 'Scores must be a list of games'; end if;
  if jsonb_array_length(p_games) <> 1 then raise exception 'A one game match has exactly 1 game'; end if;
  if jsonb_typeof(p_games -> 0) <> 'array' or jsonb_array_length(p_games -> 0) <> 2 then
    raise exception 'Game 1 needs two scores';
  end if;
  v_a := (p_games -> 0 ->> 0)::smallint;
  v_b := (p_games -> 0 ->> 1)::smallint;
  if v_a is null or v_b is null or not public.is_valid_game_score(v_a, v_b) then
    raise exception 'Game 1 has an invalid score';
  end if;
  return case when v_a > v_b then 'a' else 'b' end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sending a challenge: the old four argument version is replaced by one with
-- an optional fifth argument. Calls with four arguments still work.
-- ---------------------------------------------------------------------------

drop function public.send_challenge(uuid, uuid, uuid, timestamptz);

create function public.send_challenge(
  p_my_team uuid,
  p_their_team uuid,
  p_court uuid,
  p_time timestamptz,
  p_best_of smallint default 3
)
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
  if p_best_of is null or p_best_of not in (1, 3) then raise exception 'Pick one game or best of 3'; end if;
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

  insert into public.challenges (challenger_team_id, challenged_team_id, court_id, proposed_time, created_by, best_of)
  values (p_my_team, p_their_team, p_court, p_time, v_me, p_best_of)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Scores are checked against the challenge's length
-- ---------------------------------------------------------------------------

create or replace function public.submit_match_result(p_challenge uuid, p_games jsonb, p_played_at timestamptz default now())
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
begin
  if v_me is null then raise exception 'Not signed in'; end if;

  select * into v_c from public.challenges where id = p_challenge for update;
  if v_c.id is null then raise exception 'Unknown challenge'; end if;
  if v_c.status <> 'accepted' then raise exception 'Scores can only be entered for an accepted challenge'; end if;
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

  insert into public.matches (challenge_id, team_a_id, team_b_id, court_id, played_at, awaiting_team_id, winner_team_id, submitted_by)
  values (
    p_challenge, v_c.challenger_team_id, v_c.challenged_team_id, v_c.court_id, p_played_at, v_other_team,
    case when v_winner = 'a' then v_c.challenger_team_id else v_c.challenged_team_id end, v_me
  )
  returning id into v_match;

  perform public.replace_games(v_match, p_games);
  insert into public.score_proposals (match_id, round, team_id, profile_id, scores)
  values (v_match, 0, v_my_team, v_me, p_games);

  return v_match;
end;
$$;

create or replace function public.dispute_match_result(p_match uuid, p_games jsonb, p_note text default null)
returns public.match_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.matches;
  v_disputer uuid;
  v_best_of smallint;
  v_winner text;
  v_current jsonb;
begin
  select * into v_m from public.matches where id = p_match for update;
  if v_m.id is null then raise exception 'Unknown match'; end if;
  if v_m.status <> 'awaiting_confirmation' then raise exception 'This result is already %', v_m.status; end if;
  v_disputer := v_m.awaiting_team_id;
  if not public.is_team_member(v_disputer, auth.uid()) then
    raise exception 'Only a player on the other team can dispute this score';
  end if;

  select best_of into v_best_of from public.challenges where id = v_m.challenge_id;
  v_winner := public.match_winner(p_games, v_best_of);

  select jsonb_agg(jsonb_build_array(team_a_score, team_b_score) order by game_number) into v_current
  from public.games where match_id = p_match;
  if v_current = p_games then raise exception 'That is the same score. Confirm it instead'; end if;

  insert into public.match_confirmations (match_id, round, team_id, profile_id, decision, note)
  values (p_match, v_m.correction_count, v_disputer, auth.uid(), 'disputed', p_note);

  if v_m.correction_count >= 2 then
    update public.matches
    set status = 'needs_admin', awaiting_team_id = null, updated_at = now()
    where id = p_match;
    return 'needs_admin';
  end if;

  insert into public.score_proposals (match_id, round, team_id, profile_id, scores, note)
  values (p_match, v_m.correction_count + 1, v_disputer, auth.uid(), p_games, p_note);
  perform public.replace_games(p_match, p_games);

  update public.matches
  set correction_count = correction_count + 1,
      awaiting_team_id = case when v_disputer = team_a_id then team_b_id else team_a_id end,
      winner_team_id = case when v_winner = 'a' then team_a_id else team_b_id end,
      updated_at = now()
  where id = p_match;

  return 'awaiting_confirmation';
end;
$$;

-- ---------------------------------------------------------------------------
-- my_challenges also returns best_of
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
  best_of smallint
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
         m.played_at,
         c.best_of
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
  public.send_challenge(uuid, uuid, uuid, timestamptz, smallint),
  public.my_challenges()
from public, anon, authenticated;
grant execute on function
  public.send_challenge(uuid, uuid, uuid, timestamptz, smallint),
  public.my_challenges()
to authenticated;

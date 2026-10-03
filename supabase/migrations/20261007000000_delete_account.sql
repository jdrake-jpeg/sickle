-- Delete my account (Apple and Google both require it for apps with sign-up).
--
-- delete_my_account() removes the player's login and everything personal:
-- location, push tokens, friends, blocks, ratings they gave or got, reports
-- they filed, court condition reports and preferred courts.
--
-- Matches other teams played against them stay, so other players' records and
-- court leaderboards don't change. Their profile row stays as a blank
-- placeholder ("Deleted player") that nobody can find, friend, team up with or
-- challenge. Open challenges with their teams are cancelled.

alter table public.profiles add column deleted_at timestamptz;

-- The placeholder profile outlives the login, so it can't cascade from it.
alter table public.profiles drop constraint profiles_id_fkey;

create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Not signed in'; end if;
  if (select is_admin from public.profiles where id = v_me)
     and not exists (select 1 from public.profiles where is_admin and id <> v_me) then
    raise exception 'You are the only admin. Make someone else an admin first.';
  end if;

  update public.challenges set status = 'cancelled', updated_at = now()
  where status in ('pending', 'accepted')
    and not exists (select 1 from public.matches m where m.challenge_id = challenges.id)
    and (challenger_team_id in (select id from public.teams where v_me in (player_low, player_high))
      or challenged_team_id in (select id from public.teams where v_me in (player_low, player_high)));

  delete from public.player_locations where profile_id = v_me;
  delete from public.push_tokens where profile_id = v_me;
  delete from public.preferred_courts where profile_id = v_me;
  delete from public.blocks where v_me in (blocker_id, blocked_id);
  delete from public.friendships where v_me in (requester_id, addressee_id);
  delete from public.player_ratings where v_me in (rater_id, ratee_id);
  delete from public.court_condition_reports where reporter_id = v_me;
  delete from public.reports where reporter_id = v_me;

  update public.profiles
  set username = 'deleted_' || substr(md5(id::text), 1, 12),
      display_name = 'Deleted player',
      avatar_url = null,
      skill_level = null,
      availability = 'off',
      availability_expires_at = null,
      is_admin = false,
      show_record = false,
      deleted_at = now()
  where id = v_me;

  delete from auth.users where id = v_me;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Deleted players don't show up in search.
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
    and p.deleted_at is null
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

-- Nobody can team up with, challenge or friend a deleted player.
create function public.reject_deleted_players()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'teams' then
    if exists (select 1 from public.profiles where id in (new.player_low, new.player_high) and deleted_at is not null) then
      raise exception 'That player deleted their account';
    end if;
  elsif tg_table_name = 'challenges' then
    if exists (
      select 1 from public.teams t join public.profiles p on p.id in (t.player_low, t.player_high)
      where t.id in (new.challenger_team_id, new.challenged_team_id) and p.deleted_at is not null
    ) then
      raise exception 'That player deleted their account';
    end if;
  elsif tg_table_name = 'friendships' then
    if exists (select 1 from public.profiles where id in (new.requester_id, new.addressee_id) and deleted_at is not null) then
      raise exception 'That player deleted their account';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.reject_deleted_players() from public, anon, authenticated;

create trigger teams_reject_deleted before insert on public.teams
  for each row execute function public.reject_deleted_players();
create trigger challenges_reject_deleted before insert on public.challenges
  for each row execute function public.reject_deleted_players();
create trigger friendships_reject_deleted before insert on public.friendships
  for each row execute function public.reject_deleted_players();

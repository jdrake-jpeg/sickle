-- Notifications: an in app inbox plus phone push, with a switch for each kind.
-- Additive: older builds ignore all of it.
--
-- Kinds (the player turns each on or off in Settings):
--   challenges  new challenges, answers, scores to confirm
--   teams       a friend makes a team with you
--   friends     friend requests and accepted requests
--   courts      conditions reported at courts you play at
--   messages    chat messages from friends
--
-- Every notification is saved in public.notifications (the inbox). A trigger on
-- that table then sends the phone push through Expo, using pg_net. If pg_net
-- isn't there, the inbox still works and nothing breaks.

do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net is not available here, so phone push is off until it is enabled';
end $$;

alter table public.profiles
  add column notify_challenges boolean not null default true,
  add column notify_teams boolean not null default true,
  add column notify_friends boolean not null default true,
  add column notify_courts boolean not null default true,
  add column notify_messages boolean not null default true;

grant update (notify_challenges, notify_teams, notify_friends, notify_courts, notify_messages) on public.profiles to authenticated;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (category in ('challenges', 'teams', 'friends', 'courts', 'messages')),
  title text not null,
  body text not null,
  -- Where tapping it goes, like {"path": "/challenges"}.
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_profile_idx on public.notifications (profile_id, created_at desc);

alter table public.notifications enable row level security;
create policy "own notifications" on public.notifications for select to authenticated using (profile_id = auth.uid());
revoke insert, update, delete on public.notifications from authenticated, anon;

-- Saves a notification for one player, if they have that kind turned on.
create function public.notify(p_profile uuid, p_category text, p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_on boolean;
begin
  select case p_category
           when 'challenges' then notify_challenges
           when 'teams' then notify_teams
           when 'friends' then notify_friends
           when 'courts' then notify_courts
           when 'messages' then notify_messages
         end
  into v_on
  from public.profiles
  where id = p_profile and deleted_at is null;
  if not coalesce(v_on, false) then return; end if;
  insert into public.notifications (profile_id, category, title, body, data)
  values (p_profile, p_category, p_title, left(p_body, 200), coalesce(p_data, '{}'::jsonb));
end;
$$;

-- Sends the phone push for a saved notification. Never lets a failure here
-- stop whatever the player was doing.
create function public.push_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_messages jsonb;
begin
  select jsonb_agg(jsonb_build_object('to', t.token, 'title', new.title, 'body', new.body, 'data', new.data, 'sound', 'default'))
  into v_messages
  from public.push_tokens t
  where t.profile_id = new.profile_id;
  if v_messages is null or to_regnamespace('net') is null then return new; end if;
  begin
    execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using 'https://exp.host/--/api/v2/push/send', v_messages, '{"Content-Type": "application/json"}'::jsonb;
  exception when others then
    null;
  end;
  return new;
end;
$$;

create trigger notifications_push
after insert on public.notifications
for each row execute function public.push_notification();

-- The phone registers itself to get pushes.
create function public.save_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_platform not in ('ios', 'android') or coalesce(p_token, '') = '' then raise exception 'Bad push token'; end if;
  insert into public.push_tokens (token, profile_id, platform, updated_at)
  values (p_token, auth.uid(), p_platform, now())
  on conflict (token) do update set profile_id = auth.uid(), platform = excluded.platform, updated_at = now();
end;
$$;

create function public.remove_push_token(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens where token = p_token and profile_id = auth.uid();
$$;

create function public.my_notifications(p_limit integer default 50)
returns table (id uuid, category text, title text, body text, data jsonb, created_at timestamptz, read_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.category, n.title, n.body, n.data, n.created_at, n.read_at
  from public.notifications n
  where n.profile_id = auth.uid()
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

create function public.mark_notifications_read()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications set read_at = now() where profile_id = auth.uid() and read_at is null;
$$;

create function public.unread_notification_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.notifications where profile_id = auth.uid() and read_at is null;
$$;

-- ---------------------------------------------------------------------------
-- What triggers them
-- ---------------------------------------------------------------------------

-- A name for the person doing the thing.
create function public.first_name(p_profile uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(split_part(display_name, ' ', 1), ''), 'Someone') from public.profiles where id = p_profile;
$$;

create function public.notify_on_challenge()
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
  select name into v_court from public.courts where id = new.court_id;
  v_mine := public.team_display_name(new.challenger_team_id);
  select player_high is null into v_singles from public.teams where id = new.challenged_team_id;
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

create trigger challenges_notify
after insert on public.challenges
for each row execute function public.notify_on_challenge();

create function public.notify_on_challenge_answer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status in ('accepted', 'declined') then
    perform public.notify(
      new.created_by, 'challenges',
      case when new.status = 'accepted' then 'Challenge accepted' else 'Challenge declined' end,
      public.team_display_name(new.challenged_team_id) || case when new.status = 'accepted' then ' accepted. Time to play.' else ' declined your challenge.' end,
      jsonb_build_object('path', '/challenges')
    );
  end if;
  return new;
end;
$$;

create trigger challenges_notify_answer
after update of status on public.challenges
for each row execute function public.notify_on_challenge_answer();

-- Someone entered a score: the other team has to confirm it.
create function public.notify_on_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p uuid;
begin
  if tg_op = 'INSERT' or (new.awaiting_team_id is distinct from old.awaiting_team_id and new.awaiting_team_id is not null) then
    for p in
      select x from public.teams t cross join lateral unnest(array[t.player_low, t.player_high]) as x
      where t.id = new.awaiting_team_id and x is not null and x <> auth.uid()
    loop
      perform public.notify(
        p, 'challenges',
        case when tg_op = 'INSERT' then 'Confirm the score' else 'Score corrected' end,
        case when tg_op = 'INSERT' then 'A score was entered for your match. Check it and confirm.' else 'The score was changed. Check it and confirm.' end,
        jsonb_build_object('path', '/challenges')
      );
    end loop;
  elsif tg_op = 'UPDATE' and old.status <> 'confirmed' and new.status = 'confirmed' then
    for p in
      select x from public.teams t cross join lateral unnest(array[t.player_low, t.player_high]) as x
      where t.id in (new.team_a_id, new.team_b_id) and x is not null and x <> auth.uid()
    loop
      perform public.notify(p, 'challenges', 'Score confirmed', 'Your match counts now. Rate how everyone played.', jsonb_build_object('path', '/challenges'));
    end loop;
  end if;
  return new;
end;
$$;

create trigger matches_notify
after insert or update of awaiting_team_id, status on public.matches
for each row execute function public.notify_on_match();

create function public.notify_on_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_other uuid := case when new.created_by = new.player_low then new.player_high else new.player_low end;
begin
  if new.player_high is not null and v_other is not null and v_other <> new.created_by then
    perform public.notify(
      v_other, 'teams', 'You are on a new team',
      public.first_name(new.created_by) || ' made a team with you: ' || public.team_display_name(new.id),
      jsonb_build_object('path', '/profile')
    );
  end if;
  return new;
end;
$$;

create trigger teams_notify
after insert on public.teams
for each row execute function public.notify_on_team();

create function public.notify_on_friendship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.addressee_id, 'friends', 'New friend request', public.first_name(new.requester_id) || ' wants to be friends.', jsonb_build_object('path', '/friends'));
  elsif new.status = 'accepted' and old.status <> 'accepted' then
    perform public.notify(new.requester_id, 'friends', 'Friend request accepted', public.first_name(new.addressee_id) || ' is your friend now.', jsonb_build_object('path', '/friends'));
  end if;
  return new;
end;
$$;

create trigger friendships_notify
after insert or update of status on public.friendships
for each row execute function public.notify_on_friendship();

create function public.notify_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.notify(new.recipient_id, 'messages', public.first_name(new.sender_id), left(new.body, 120), jsonb_build_object('path', '/friends'));
  return new;
end;
$$;

create trigger messages_notify
after insert on public.messages
for each row execute function public.notify_on_message();

-- Court conditions go to players who play at that court: it's one of their
-- preferred courts, or they played or challenged there in the last 90 days.
-- At most one a day per court per player, so it never turns into spam.
create function public.notify_on_condition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_court public.courts;
  p uuid;
  v_label text;
begin
  select * into v_court from public.courts where id = new.court_id;
  if v_court.id is null or v_court.status <> 'approved' then return new; end if;
  v_label := case new.condition::text
               when 'good' then 'good to play'
               when 'wet' then 'wet'
               when 'windy' then 'windy'
               when 'icy' then 'icy'
               when 'crowded' then 'crowded'
               else new.condition::text end;
  for p in
    select distinct pr.id
    from public.profiles pr
    where pr.id <> new.reporter_id and pr.deleted_at is null
      and (
        exists (select 1 from public.preferred_courts pc where pc.profile_id = pr.id and pc.court_id = new.court_id)
        or exists (
          select 1 from public.challenges c
          join public.teams t on t.id in (c.challenger_team_id, c.challenged_team_id)
          where c.court_id = new.court_id and pr.id in (t.player_low, t.player_high)
            and c.created_at > now() - interval '90 days'
        )
      )
      and (
        not v_court.is_private
        or pr.id = v_court.submitted_by
        or exists (
          select 1 from public.friendships f
          where f.status = 'accepted'
            and ((f.requester_id = v_court.submitted_by and f.addressee_id = pr.id) or (f.requester_id = pr.id and f.addressee_id = v_court.submitted_by))
        )
      )
      and not exists (
        select 1 from public.notifications n
        where n.profile_id = pr.id and n.category = 'courts'
          and n.data ->> 'court' = new.court_id::text and n.created_at > now() - interval '1 day'
      )
  loop
    perform public.notify(
      p, 'courts', v_court.name || ' is ' || v_label,
      coalesce(nullif(new.note, ''), 'A player there just reported the conditions.'),
      jsonb_build_object('path', '/court/' || new.court_id::text, 'court', new.court_id::text)
    );
  end loop;
  return new;
end;
$$;

create trigger conditions_notify
after insert on public.court_condition_reports
for each row execute function public.notify_on_condition();

revoke execute on function
  public.notify(uuid, text, text, text, jsonb),
  public.push_notification(),
  public.save_push_token(text, text),
  public.remove_push_token(text),
  public.my_notifications(integer),
  public.mark_notifications_read(),
  public.unread_notification_count(),
  public.first_name(uuid),
  public.notify_on_challenge(),
  public.notify_on_challenge_answer(),
  public.notify_on_match(),
  public.notify_on_team(),
  public.notify_on_friendship(),
  public.notify_on_message(),
  public.notify_on_condition()
from public, anon, authenticated;
grant execute on function
  public.save_push_token(text, text),
  public.remove_push_token(text),
  public.my_notifications(integer),
  public.mark_notifications_read(),
  public.unread_notification_count()
to authenticated;

-- Chat with friends. Only friends can message each other, and only the two of
-- them can read the conversation. Writes go through functions; the app polls.

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id)
);

create index messages_pair_idx on public.messages (least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at desc);
create index messages_unread_idx on public.messages (recipient_id) where read_at is null;

alter table public.messages enable row level security;
create policy "own messages" on public.messages for select to authenticated
  using (auth.uid() in (sender_id, recipient_id));
revoke insert, update, delete on public.messages from authenticated, anon;

-- Deleting an account removes its messages too (the profile row stays behind
-- as "Deleted player", so nothing cascades on its own).
create function public.purge_messages_on_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.messages where new.id in (sender_id, recipient_id);
  return new;
end;
$$;

create trigger profiles_purge_messages
after update of deleted_at on public.profiles
for each row
when (old.deleted_at is null and new.deleted_at is not null)
execute function public.purge_messages_on_delete();

create function public.send_message(p_to uuid, p_body text)
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
  if v_me is null or not exists (select 1 from public.profiles where id = v_me) then
    raise exception 'Finish setting up your profile first';
  end if;
  if v_body = '' then raise exception 'Write a message first'; end if;
  if char_length(v_body) > 1000 then raise exception 'Keep messages under 1000 characters'; end if;
  if not public.are_friends(v_me, p_to) or public.players_blocked(v_me, p_to) then
    raise exception 'You can only message friends';
  end if;
  if (select count(*) from public.messages where sender_id = v_me and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Slow down a little, then try again';
  end if;

  insert into public.messages (sender_id, recipient_id, body) values (v_me, p_to, v_body) returning id into v_id;
  return v_id;
end;
$$;

-- The latest messages between you and a friend, oldest first.
create function public.conversation(p_friend uuid, p_limit integer default 100)
returns table (id uuid, mine boolean, body text, created_at timestamptz, read_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (
    select m.id, m.sender_id = auth.uid(), m.body, m.created_at, m.read_at
    from public.messages m
    where public.are_friends(auth.uid(), p_friend)
      and not public.players_blocked(auth.uid(), p_friend)
      and ((m.sender_id = auth.uid() and m.recipient_id = p_friend) or (m.sender_id = p_friend and m.recipient_id = auth.uid()))
    order by m.created_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 200)
  ) recent
  order by created_at;
$$;

create function public.mark_conversation_read(p_friend uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.messages set read_at = now()
  where recipient_id = auth.uid() and sender_id = p_friend and read_at is null;
$$;

-- One row per friend you have messages with, newest first.
create function public.my_conversations()
returns table (friend_id uuid, last_body text, last_at timestamptz, last_mine boolean, unread bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select f.friend_id, l.body, l.created_at, l.sender_id = auth.uid(),
         (select count(*) from public.messages u where u.sender_id = f.friend_id and u.recipient_id = auth.uid() and u.read_at is null)
  from (
    select case when fr.requester_id = auth.uid() then fr.addressee_id else fr.requester_id end as friend_id
    from public.friendships fr
    where fr.status = 'accepted' and auth.uid() in (fr.requester_id, fr.addressee_id)
  ) f
  cross join lateral (
    select m.body, m.created_at, m.sender_id
    from public.messages m
    where (m.sender_id = auth.uid() and m.recipient_id = f.friend_id) or (m.sender_id = f.friend_id and m.recipient_id = auth.uid())
    order by m.created_at desc
    limit 1
  ) l
  where not public.players_blocked(auth.uid(), f.friend_id)
  order by l.created_at desc;
$$;

-- For the badge on the Friends tab.
create function public.unread_message_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.messages m
  where m.recipient_id = auth.uid() and m.read_at is null
    and public.are_friends(auth.uid(), m.sender_id);
$$;

revoke execute on function
  public.purge_messages_on_delete(),
  public.send_message(uuid, text),
  public.conversation(uuid, integer),
  public.mark_conversation_read(uuid),
  public.my_conversations(),
  public.unread_message_count()
from public, anon, authenticated;
grant execute on function
  public.send_message(uuid, text),
  public.conversation(uuid, integer),
  public.mark_conversation_read(uuid),
  public.my_conversations(),
  public.unread_message_count()
to authenticated;

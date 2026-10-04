-- Verifies chat: only friends can message, only the two people can read it,
-- unread counts and read marks, limits, blocks and account deletion.
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000af01'), ('00000000-0000-0000-0000-00000000af02'),
  ('00000000-0000-0000-0000-00000000af03');
insert into public.profiles (id, username, display_name) values
  ('00000000-0000-0000-0000-00000000af01', 'chatone', 'Chat One'),
  ('00000000-0000-0000-0000-00000000af02', 'chattwo', 'Chat Two'),
  ('00000000-0000-0000-0000-00000000af03', 'chatthree', 'Chat Three');

create function pg_temp.expect_error(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm not like p_expected || '%' then
      raise exception 'Expected error "%" but got "%"', p_expected, sqlerrm;
    end if;
    return;
  end;
  raise exception 'Expected error "%" but the statement succeeded: %', p_expected, p_sql;
end $$;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000af01';

-- Not friends yet.
select pg_temp.expect_error($$select public.send_message('00000000-0000-0000-0000-00000000af02', 'hey')$$, 'You can only message friends');

select public.add_friend('00000000-0000-0000-0000-00000000af02');
select pg_temp.expect_error($$select public.send_message('00000000-0000-0000-0000-00000000af02', 'hey')$$, 'You can only message friends');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000af02';
select public.add_friend('00000000-0000-0000-0000-00000000af01');

-- Now they can talk.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000af01';
select pg_temp.expect_error($$select public.send_message('00000000-0000-0000-0000-00000000af02', '   ')$$, 'Write a message first');
select pg_temp.expect_error($$select public.send_message('00000000-0000-0000-0000-00000000af02', repeat('x', 1001))$$, 'Keep messages under 1000');
select public.send_message('00000000-0000-0000-0000-00000000af02', '  Game at 6?  ');
select public.send_message('00000000-0000-0000-0000-00000000af02', 'Porter Park');
do $$ begin
  assert (select count(*) from public.conversation('00000000-0000-0000-0000-00000000af02')) = 2, 'two messages';
  assert (select body from public.conversation('00000000-0000-0000-0000-00000000af02') order by created_at, id limit 1) = 'Game at 6?', 'trimmed';
  assert (select bool_and(mine) from public.conversation('00000000-0000-0000-0000-00000000af02')), 'mine';
  assert public.unread_message_count() = 0, 'sender has no unread';
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000af02';
do $$ begin
  assert public.unread_message_count() = 2, 'two unread';
  assert (select unread from public.my_conversations()) = 2, 'conversation unread';
  assert (select last_body from public.my_conversations()) = 'Porter Park', 'last message';
  assert not (select last_mine from public.my_conversations()), 'last was theirs';
end $$;
select public.mark_conversation_read('00000000-0000-0000-0000-00000000af01');
do $$ begin
  assert public.unread_message_count() = 0, 'read';
  assert (select unread from public.my_conversations()) = 0, 'conversation read';
end $$;
select public.send_message('00000000-0000-0000-0000-00000000af01', 'Be there');

-- Nobody else can read it, directly or through the functions.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000af03';
do $$ begin
  assert (select count(*) from public.messages) = 0, 'RLS hides other people''s messages';
  assert (select count(*) from public.conversation('00000000-0000-0000-0000-00000000af01')) = 0, 'not friends, nothing';
  assert (select count(*) from public.my_conversations()) = 0, 'no conversations';
end $$;
select pg_temp.expect_error($$insert into public.messages (sender_id, recipient_id, body) values ('00000000-0000-0000-0000-00000000af03', '00000000-0000-0000-0000-00000000af01', 'hi')$$, 'permission denied');

-- Blocking ends the friendship, so messaging stops and history is hidden.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000af01';
insert into public.blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-00000000af01', '00000000-0000-0000-0000-00000000af02');
select pg_temp.expect_error($$select public.send_message('00000000-0000-0000-0000-00000000af02', 'hello?')$$, 'You can only message friends');
do $$ begin assert (select count(*) from public.conversation('00000000-0000-0000-0000-00000000af02')) = 0, 'history hidden after block'; end $$;

-- Deleting an account removes its messages.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000af02';
select public.delete_my_account();
reset role;
do $$ begin
  assert (select count(*) from public.messages where '00000000-0000-0000-0000-00000000af02' in (sender_id, recipient_id)) = 0, 'messages purged';
end $$;

reset request.jwt.claim.sub;
\echo 'Messages tests passed'

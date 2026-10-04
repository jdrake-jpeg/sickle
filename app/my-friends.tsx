import { Link, useFocusEffect } from 'expo-router';
import { ReactNode, useCallback, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { ShowMore, usePaged } from '@/components/ShowMore';
import { skillLabel } from '@/components/SkillPicker';
import { Avatar, Body, Button, Card, Display, ListRow, Screen, SectionHeader } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { Conversation, fetchConversations } from '@/lib/chat';
import { initialsOf } from '@/lib/format';
import { addFriend, fetchFriends, FriendRow, removeFriend } from '@/lib/friends';

// Your friends: answer requests, chat, unfriend, and see who you asked.
// Finding new people is on the Find people tab.
export default function MyFriendsScreen() {
  const { demoMode } = useAuth();
  const [friends, setFriends] = useState<FriendRow[] | null>(null);
  const [chats, setChats] = useState<Conversation[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [f, c] = await Promise.all([fetchFriends(demoMode), fetchConversations(demoMode)]);
    setFriends(f);
    setChats(c);
  }, [demoMode]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const run = async (id: string, action: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await action();
      await load();
    } catch (error) {
      Alert.alert("Couldn't do that", error instanceof Error ? error.message : 'Try again.');
    } finally {
      setBusy(null);
    }
  };

  const askUnfriend = (p: FriendRow) =>
    Alert.alert(`Unfriend ${p.name.split(' ')[0]}?`, "You won't be able to chat. You can add each other again later.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unfriend', style: 'destructive', onPress: () => run(p.id, () => removeFriend(demoMode, p.id)) },
    ]);

  const all = friends ?? [];
  const incoming = all.filter((f) => f.relation === 'incoming');
  const accepted = all.filter((f) => f.relation === 'friend');
  const sent = all.filter((f) => f.relation === 'outgoing');
  const paged = usePaged(accepted, 8);

  const person = (p: FriendRow, subtitle: string, right: ReactNode, chat = false) => (
    <Link
      key={p.id}
      href={chat ? { pathname: '/chat/[id]', params: { id: p.id, name: p.name } } : { pathname: '/player/[id]', params: { id: p.id } }}
      asChild>
      <Pressable accessibilityRole="link">
        <ListRow left={<Avatar initials={initialsOf(p.name)} size={40} />} title={p.name} subtitle={subtitle} right={right} />
      </Pressable>
    </Link>
  );

  return (
    <Screen>
      <Display size={28}>MY FRIENDS</Display>
      <Link href="/friends" asChild>
        <Button label="Find more people" variant="outline" size="sm" style={{ alignSelf: 'flex-start' }} />
      </Link>

      {incoming.length > 0 ? (
        <View style={{ gap: 8 }}>
          <SectionHeader title="Friend requests" detail={`${incoming.length}`} />
          {incoming.map((p) =>
            person(
              p,
              `@${p.username} wants to be friends`,
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Button label="No" variant="ghost" size="sm" disabled={busy === p.id} onPress={() => run(p.id, () => removeFriend(demoMode, p.id))} />
                <Button label="Accept" size="sm" disabled={busy === p.id} onPress={() => run(p.id, () => addFriend(demoMode, p.id, 'incoming'))} />
              </View>,
            ),
          )}
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <SectionHeader title="Friends" detail={`${accepted.length}`} />
        {friends === null ? <Body tone="muted">Loading…</Body> : null}
        {friends && accepted.length === 0 ? (
          <Card style={{ padding: 16 }}>
            <Body tone="muted">No friends yet. Tap Find more people to add some.</Body>
          </Card>
        ) : null}
        {paged.shown.map((p) => {
          const chat = chats.find((c) => c.friend_id === p.id);
          return person(
            p,
            chat ? `${chat.last_mine ? 'You: ' : ''}${chat.last_body}` : [`@${p.username}`, skillLabel(p.skill)].filter(Boolean).join(' · '),
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              {chat && chat.unread > 0 ? (
                <Body size={13} weight="bold" tone="danger">
                  {chat.unread} new
                </Body>
              ) : (
                <Body size={13} weight="bold" tone="accent">
                  Chat
                </Body>
              )}
              <Pressable accessibilityRole="button" disabled={busy === p.id} onPress={() => askUnfriend(p)} hitSlop={8}>
                <Body size={12} tone="muted">
                  Unfriend
                </Body>
              </Pressable>
            </View>,
            true,
          );
        })}
        <ShowMore hasMore={paged.hasMore} remaining={paged.remaining} onPress={paged.more} />
      </View>

      {sent.length > 0 ? (
        <View style={{ gap: 8 }}>
          <SectionHeader title="Requests you sent" detail={`${sent.length}`} />
          {sent.map((p) =>
            person(p, `@${p.username} · waiting`, <Button label="Cancel" variant="ghost" size="sm" disabled={busy === p.id} onPress={() => run(p.id, () => removeFriend(demoMode, p.id))} />),
          )}
        </View>
      ) : null}
    </Screen>
  );
}

import { Link, useFocusEffect } from 'expo-router';
import { ReactNode, useCallback, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { ShowMore, usePaged } from '@/components/ShowMore';
import { skillLabel } from '@/components/SkillPicker';
import { Avatar, Body, Button, Card, Display, Screen, SectionHeader } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { Conversation, fetchConversations } from '@/lib/chat';
import { initialsOf } from '@/lib/format';
import { addFriend, fetchFriends, FriendRow, removeFriend } from '@/lib/friends';

// Your friends: answer requests, open a profile, or tap Chat. Unfriending is
// at the bottom of their profile. Finding new people is on the Find people tab.
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

  const all = friends ?? [];
  const incoming = all.filter((f) => f.relation === 'incoming');
  const accepted = all.filter((f) => f.relation === 'friend');
  const sent = all.filter((f) => f.relation === 'outgoing');
  const paged = usePaged(accepted, 8);

  // Name and photo open their profile. The right side holds the buttons.
  const person = (p: FriendRow, subtitle: string, right: ReactNode) => (
    <Card key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16 }}>
      <Link href={{ pathname: '/player/[id]', params: { id: p.id } }} asChild>
        <Pressable accessibilityRole="link" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar initials={initialsOf(p.name)} size={40} />
          <View style={{ flex: 1, gap: 2 }}>
            <Body weight="semibold">{p.name}</Body>
            <Body size={13} tone="muted" numberOfLines={1}>
              {subtitle}
            </Body>
          </View>
        </Pressable>
      </Link>
      {right}
    </Card>
  );

  return (
    <Screen>
      <Display size={28}>MY FRIENDS</Display>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Link href="/friends" asChild>
          <Button label="Find people" variant="outline" size="sm" />
        </Link>
        <Link href="/chats" asChild>
          <Button label="Chats" variant="outline" size="sm" />
        </Link>
      </View>

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
            <Body tone="muted">No friends yet. Tap Find people to add some.</Body>
          </Card>
        ) : null}
        {paged.shown.map((p) => {
          const chat = chats.find((c) => c.friend_id === p.id);
          return person(
            p,
            chat ? `${chat.last_mine ? 'You: ' : ''}${chat.last_body}` : [`@${p.username}`, skillLabel(p.skill)].filter(Boolean).join(' · '),
            <Link href={{ pathname: '/chat/[id]', params: { id: p.id, name: p.name } }} asChild>
              <Button label={chat && chat.unread > 0 ? `Chat (${chat.unread})` : 'Chat'} size="sm" />
            </Link>,
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

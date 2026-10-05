import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { Avatar, Body, Button, Card, Display, Screen, SectionHeader } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { Conversation, fetchConversations, fetchGroupChats, GroupChat, leaveGroupChat } from '@/lib/chat';
import { initialsOf } from '@/lib/format';
import { fetchFriends, FriendRow } from '@/lib/friends';
import { formatWhen } from '@/lib/matches';

// Every chat in one place: game chats (the four players in a doubles
// challenge) and chats with friends.
export default function ChatsScreen() {
  const { demoMode } = useAuth();
  const [groups, setGroups] = useState<GroupChat[] | null>(null);
  const [chats, setChats] = useState<Conversation[] | null>(null);
  const [friends, setFriends] = useState<FriendRow[]>([]);

  const load = useCallback(async () => {
    const [g, c, f] = await Promise.all([fetchGroupChats(demoMode), fetchConversations(demoMode), fetchFriends(demoMode)]);
    setGroups(g);
    setChats(c);
    setFriends(f);
  }, [demoMode]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const askDelete = (g: GroupChat) =>
    Alert.alert('Delete this chat?', 'It only goes away for you.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await leaveGroupChat(demoMode, g.chat_id);
            await load();
          } catch (e) {
            Alert.alert("Couldn't delete it", e instanceof Error ? e.message : 'Try again.');
          }
        },
      },
    ]);

  const nameOf = (id: string) => friends.find((f) => f.id === id)?.name ?? 'Friend';

  return (
    <Screen>
      <Display size={28}>CHATS</Display>

      {groups && groups.length > 0 ? (
        <View style={{ gap: 8 }}>
          <SectionHeader title="Game chats" detail={`${groups.length}`} />
          {groups.map((g) => (
            <Card key={g.chat_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16 }}>
              <Link href={{ pathname: '/group/[id]', params: { id: g.chat_id } }} asChild>
                <Pressable accessibilityRole="link" style={{ flex: 1, gap: 2 }}>
                  <Body weight="semibold" numberOfLines={1}>
                    {g.members ?? 'Game chat'}
                  </Body>
                  <Body size={13} tone="muted" numberOfLines={1}>
                    {g.last_body ? `${g.last_sender}: ${g.last_body}` : `${g.court_name} · ${formatWhen(g.proposed_time)}`}
                  </Body>
                </Pressable>
              </Link>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                {g.unread > 0 ? (
                  <Body size={13} weight="bold" tone="danger">
                    {g.unread} new
                  </Body>
                ) : null}
                <Button label="Delete" variant="ghost" size="sm" onPress={() => askDelete(g)} />
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <SectionHeader title="Friends" detail={chats ? `${chats.length}` : undefined} />
        {chats && chats.length === 0 ? (
          <Card style={{ padding: 16 }}>
            <Body tone="muted">No chats yet. Tap Chat on a friend to start one.</Body>
          </Card>
        ) : null}
        {(chats ?? []).map((c) => (
          <Link key={c.friend_id} href={{ pathname: '/chat/[id]', params: { id: c.friend_id, name: nameOf(c.friend_id) } }} asChild>
            <Pressable accessibilityRole="link">
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16 }}>
                <Avatar initials={initialsOf(nameOf(c.friend_id))} size={40} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Body weight="semibold">{nameOf(c.friend_id)}</Body>
                  <Body size={13} tone="muted" numberOfLines={1}>
                    {c.last_mine ? 'You: ' : ''}
                    {c.last_body}
                  </Body>
                </View>
                {c.unread > 0 ? (
                  <Body size={13} weight="bold" tone="danger">
                    {c.unread} new
                  </Body>
                ) : null}
              </Card>
            </Pressable>
          </Link>
        ))}
        <Link href="/my-friends" asChild>
          <Button label="Start a chat with a friend" variant="outline" size="sm" style={{ alignSelf: 'flex-start' }} />
        </Link>
      </View>
    </Screen>
  );
}

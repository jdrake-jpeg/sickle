import { Link, router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QuickChatBar } from '@/components/QuickChatBar';
import { VsLine } from '@/components/VsLine';
import { Body, Button, Card, Heading } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fetchConversation, markConversationRead, Message, quickChats, sendMessage } from '@/lib/chat';
import { fetchFriendActivity, formatWhen, FriendActivity, matchStatusText, timeAgo } from '@/lib/matches';
import { useTheme } from '@/lib/theme';

type Item = { at: string; message?: Message; activity?: FriendActivity };

function gameLine(a: FriendActivity) {
  if (a.challenge_status === 'pending') return a.from_me ? 'Waiting for an answer' : 'Waiting on you';
  if (a.challenge_status === 'declined') return 'Declined';
  if (a.challenge_status === 'cancelled') return 'Called off';
  if (a.match_status) return matchStatusText({ match_status: a.match_status, awaiting_me: false });
  return 'Accepted';
}

// A chat with one friend. Quick messages only. Challenges between you and
// private feedback show up in the chat too. Newest is at the bottom.
export default function ChatScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { colors } = useTheme();
  const { demoMode } = useAuth();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [activity, setActivity] = useState<FriendActivity[]>([]);
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const friend = name || 'Friend';
  const first = friend.split(' ')[0];

  const load = useCallback(async () => {
    const list = await fetchConversation(demoMode, id);
    setMessages(list);
    if (list.some((m) => !m.mine && !m.read_at)) markConversationRead(demoMode, id);
  }, [demoMode, id]);

  useFocusEffect(
    useCallback(() => {
      load();
      fetchFriendActivity(demoMode, id).then(setActivity);
      const fast = setInterval(load, 4000);
      const slow = setInterval(() => fetchFriendActivity(demoMode, id).then(setActivity), 20000);
      return () => {
        clearInterval(fast);
        clearInterval(slow);
      };
    }, [load, demoMode, id]),
  );

  const send = async (body: string) => {
    setBusy(true);
    try {
      await sendMessage(demoMode, id, body);
      await load();
    } catch (e) {
      Alert.alert("Couldn't send that", e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const items: Item[] = [
    ...(messages ?? []).map((m) => ({ at: m.created_at, message: m })),
    ...activity.map((a) => ({ at: a.at, activity: a })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const openGame = (a: FriendActivity) => {
    if (a.match_id && a.challenge_id) router.push({ pathname: '/match/[id]', params: { id: a.challenge_id } });
    else router.navigate({ pathname: '/challenges', params: { tab: a.challenge_status === 'accepted' ? 'upcoming' : a.from_me ? 'sent' : 'incoming' } });
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: friend }} />
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 }}>
        <Link href={{ pathname: '/player/[id]', params: { id } }} asChild>
          <Button label={`${first}'s profile and challenges`} variant="outline" size="sm" />
        </Link>
      </View>

      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1, justifyContent: 'flex-end' }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        {messages && items.length === 0 ? (
          <Card style={{ padding: 16 }}>
            <Body tone="muted">No messages yet. Tap a quick chat to say hi to {first}.</Body>
          </Card>
        ) : null}

        {items.map((item, i) => {
          if (item.message) {
            const m = item.message;
            return (
              <View key={`m${m.id}`} style={{ alignItems: m.mine ? 'flex-end' : 'flex-start' }}>
                <View style={{ maxWidth: '85%', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, gap: 2, backgroundColor: m.mine ? colors.accentFill : colors.surfaceRaised }}>
                  <Body tone={m.mine ? 'onAccent' : 'default'}>{m.body}</Body>
                  <Body size={11} tone={m.mine ? 'onAccent' : 'muted'}>
                    {formatWhen(m.created_at)}
                  </Body>
                </View>
              </View>
            );
          }
          const a = item.activity!;
          if (a.kind === 'rating') {
            return (
              <View key={`r${i}`} style={{ alignItems: a.from_me ? 'flex-end' : 'flex-start' }}>
                <View style={{ maxWidth: '85%', padding: 12, borderRadius: 18, gap: 4, borderWidth: 1, borderColor: colors.accentText, backgroundColor: colors.surface }}>
                  <Body size={12} weight="bold" tone="muted" style={{ letterSpacing: 1 }}>
                    PRIVATE FEEDBACK
                  </Body>
                  <Body size={13} weight="semibold">
                    {a.from_me ? `You rated ${first}` : `${first} rated you`}
                  </Body>
                  <Heading size={22} tone="accent">
                    {Number(a.skill).toFixed(1)}
                  </Heading>
                  {a.note ? <Body size={14}>&ldquo;{a.note}&rdquo;</Body> : null}
                  <Body size={11} tone="muted">
                    {timeAgo(a.at)}
                  </Body>
                </View>
              </View>
            );
          }
          return (
            <Pressable key={`g${i}`} accessibilityRole="link" onPress={() => openGame(a)}>
              <Card style={{ padding: 14, gap: 6 }}>
                <Body size={12} weight="bold" tone="muted" style={{ letterSpacing: 1 }}>
                  {a.same_team ? 'PLAYED TOGETHER' : 'CHALLENGE'}
                </Body>
                <VsLine you={a.my_team_name ?? 'You'} them={a.their_team_name ?? first} size={16} />
                <Body size={13} tone="muted">
                  {[a.court_name, a.proposed_time ? formatWhen(a.proposed_time) : null].filter(Boolean).join(' · ')}
                </Body>
                <Body size={13} weight="bold" tone="accent">
                  {gameLine(a)}
                </Body>
              </Card>
            </Pressable>
          );
        })}
      </ScrollView>

      <QuickChatBar options={quickChats} busy={busy} onSend={send} />
    </SafeAreaView>
  );
}

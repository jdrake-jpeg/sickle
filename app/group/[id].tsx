import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { QuickChatBar } from '@/components/QuickChatBar';
import { Body, Card, Heading } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fetchGroupChats, fetchGroupConversation, GroupChat, GroupMessage, gameChats, leaveGroupChat, markGroupRead, sendGroupMessage } from '@/lib/chat';
import { formatWhen } from '@/lib/matches';
import { useTheme } from '@/lib/theme';

// The chat for the four players in an accepted doubles challenge. Quick
// messages only. Delete it any time; that only removes it for you.
export default function GroupChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { demoMode } = useAuth();
  const [messages, setMessages] = useState<GroupMessage[] | null>(null);
  const [info, setInfo] = useState<GroupChat | null>(null);
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    const [list, chats] = await Promise.all([fetchGroupConversation(demoMode, id), fetchGroupChats(demoMode)]);
    setMessages(list);
    setInfo(chats.find((c) => c.chat_id === id) ?? null);
    markGroupRead(demoMode, id);
  }, [demoMode, id]);

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, 4000);
      return () => clearInterval(timer);
    }, [load]),
  );

  const send = async (body: string) => {
    setBusy(true);
    try {
      await sendGroupMessage(demoMode, id, body);
      await load();
    } catch (e) {
      Alert.alert("Couldn't send that", e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const askDelete = () =>
    Alert.alert('Delete this chat?', 'It only goes away for you.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await leaveGroupChat(demoMode, id);
            router.back();
          } catch (e) {
            Alert.alert("Couldn't delete it", e instanceof Error ? e.message : 'Try again.');
          }
        },
      },
    ]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: info?.members ?? 'Game chat',
          headerRight: () => (
            <Pressable accessibilityRole="button" onPress={askDelete} hitSlop={10}>
              <Body weight="bold" tone="danger">
                Delete
              </Body>
            </Pressable>
          ),
        }}
      />
      {info ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 }}>
          <Card style={{ padding: 12, gap: 2 }}>
            <Heading size={15}>{info.title}</Heading>
            <Body size={13} tone="muted">
              {info.court_name} · {formatWhen(info.proposed_time)}
            </Body>
          </Card>
        </View>
      ) : null}

      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1, justifyContent: 'flex-end' }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        {messages && messages.length === 0 ? (
          <Card style={{ padding: 16 }}>
            <Body tone="muted">Tap a quick chat to set up the game.</Body>
          </Card>
        ) : null}
        {(messages ?? []).map((m) => (
          <View key={m.id} style={{ alignItems: m.mine ? 'flex-end' : 'flex-start' }}>
            <View style={{ maxWidth: '85%', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, gap: 2, backgroundColor: m.mine ? colors.accentFill : colors.surfaceRaised }}>
              {m.mine ? null : (
                <Body size={12} weight="bold" tone="accent">
                  {m.sender_name}
                </Body>
              )}
              <Body tone={m.mine ? 'onAccent' : 'default'}>{m.body}</Body>
              <Body size={11} tone={m.mine ? 'onAccent' : 'muted'}>
                {formatWhen(m.created_at)}
              </Body>
            </View>
          </View>
        ))}
      </ScrollView>

      <QuickChatBar options={gameChats} busy={busy} onSend={send} />
    </SafeAreaView>
  );
}

import { Link, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';

import { Body, Button, Card, Field, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fetchConversation, markConversationRead, Message, sendMessage } from '@/lib/chat';
import { formatWhen } from '@/lib/matches';
import { useTheme } from '@/lib/theme';

// A chat with one friend. Newest message first, so the latest is always on
// screen. Refreshes every few seconds while it's open.
export default function ChatScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { colors } = useTheme();
  const { demoMode } = useAuth();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
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
      const timer = setInterval(load, 4000);
      return () => clearInterval(timer);
    }, [load]),
  );

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      await sendMessage(demoMode, id, body);
      setText('');
      await load();
    } catch (e) {
      Alert.alert("Couldn't send that", e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const newestFirst = [...(messages ?? [])].reverse();

  return (
    <Screen>
      <Stack.Screen options={{ title: friend }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Link href={{ pathname: '/friends/[id]', params: { id, name: friend } }} asChild>
          <Button label="Games and ratings" variant="outline" size="sm" style={{ flex: 1 }} />
        </Link>
        <Link href={{ pathname: '/player/[id]', params: { id } }} asChild>
          <Button label="Challenge" variant="dangerOutline" size="sm" style={{ flex: 1 }} />
        </Link>
      </View>

      <Field
        label={`Message ${first}`}
        placeholder="Game at 6 tonight?"
        value={text}
        onChangeText={setText}
        multiline
        maxLength={1000}
        style={{ minHeight: 56, paddingTop: 12 }}
      />
      <Button label={busy ? 'Sending…' : 'Send'} disabled={busy || !text.trim()} onPress={send} />

      {messages && messages.length === 0 ? (
        <Card style={{ padding: 16 }}>
          <Body tone="muted">No messages yet. Say hi to {first} and set up a game. Only the two of you can see this chat.</Body>
        </Card>
      ) : null}

      {newestFirst.map((m) => (
        <View key={m.id} style={{ alignItems: m.mine ? 'flex-end' : 'flex-start' }}>
          <View style={{ maxWidth: '85%', padding: 12, borderRadius: 16, gap: 4, backgroundColor: m.mine ? colors.accentFill : colors.surfaceRaised }}>
            <Body tone={m.mine ? 'onAccent' : 'default'}>{m.body}</Body>
            <Body size={11} tone={m.mine ? 'onAccent' : 'muted'}>
              {formatWhen(m.created_at)}
            </Body>
          </View>
        </View>
      ))}
    </Screen>
  );
}

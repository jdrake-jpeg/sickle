import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { Body, Button, Card, Screen } from '@/components/ui';
import { clearAll, fetchInbox, InboxItem, markAllRead, markRead, openFromData } from '@/lib/notifications';
import { timeAgo } from '@/lib/matches';
import { useAuth } from '@/lib/auth';
import { Link } from 'expo-router';

// Everything Sickle has told you, newest first. Filter what you get in Settings.
export default function NotificationsScreen() {
  const { demoMode } = useAuth();
  const [items, setItems] = useState<InboxItem[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (demoMode) {
        setItems([]);
        return;
      }
      fetchInbox().then(setItems);
    }, [demoMode]),
  );

  const unread = (items ?? []).filter((n) => !n.read_at).length;

  const readAll = async () => {
    setItems((list) => (list ?? []).map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    await markAllRead();
  };

  const clear = () =>
    Alert.alert('Clear all alerts?', 'They are deleted for good.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear all',
        style: 'destructive',
        onPress: async () => {
          try {
            await clearAll();
            setItems([]);
          } catch (e) {
            Alert.alert("Couldn't clear them", e instanceof Error ? e.message : 'Try again.');
          }
        },
      },
    ]);

  const open = (n: InboxItem) => {
    if (!n.read_at) {
      setItems((list) => (list ?? []).map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      markRead(n.id);
    }
    openFromData(n.data);
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button label={unread > 0 ? `Mark all read (${unread})` : 'All read'} variant="outline" size="sm" disabled={unread === 0} onPress={readAll} />
        <Button label="Clear all" variant="dangerOutline" size="sm" disabled={!items || items.length === 0} onPress={clear} />
        <Link href="/settings" asChild>
          <Button label="Choose what you get" variant="ghost" size="sm" />
        </Link>
      </View>
      {items === null ? <Body tone="muted">Loading…</Body> : null}
      {items && items.length === 0 ? (
        <Card style={{ padding: 16 }}>
          <Body tone="muted">Nothing yet. Challenges, friend requests, teams and court updates show up here.</Body>
        </Card>
      ) : null}
      {(items ?? []).map((n) => (
        <Pressable key={n.id} accessibilityRole="button" onPress={() => open(n)}>
          <Card highlighted={!n.read_at} style={{ padding: 14, gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Body weight="bold" style={{ flex: 1 }}>
                {n.title}
              </Body>
              <Body size={12} tone="muted">
                {timeAgo(n.created_at)}
              </Body>
            </View>
            <Body size={14} tone="muted">
              {n.body}
            </Body>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

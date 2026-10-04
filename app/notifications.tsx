import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Body, Button, Card, Screen } from '@/components/ui';
import { fetchInbox, InboxItem, markAllRead, openFromData } from '@/lib/notifications';
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
      fetchInbox().then((rows) => {
        setItems(rows);
        // They have now seen them, so the badge clears.
        if (rows.some((r) => !r.read_at)) markAllRead();
      });
    }, [demoMode]),
  );

  return (
    <Screen>
      <Link href="/settings" asChild>
        <Button label="Choose what you get" variant="outline" size="sm" style={{ alignSelf: 'flex-start' }} />
      </Link>
      {items === null ? <Body tone="muted">Loading…</Body> : null}
      {items && items.length === 0 ? (
        <Card style={{ padding: 16 }}>
          <Body tone="muted">Nothing yet. Challenges, friend requests, teams and court updates show up here.</Body>
        </Card>
      ) : null}
      {(items ?? []).map((n) => (
        <Pressable key={n.id} accessibilityRole="button" onPress={() => openFromData(n.data)}>
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

import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { Body, Button, Card } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { createTestAccount, enterTestAccount, fetchTestAccount, TestAccount } from '@/lib/test-account';

// Admin only. Your test player: a separate account that acts like any other
// player, so you can send yourself challenges and try everything. Its games and
// profile are hidden from real players, records and leaderboards.
export function TestAccountControls() {
  const { demoMode } = useAuth();
  const [account, setAccount] = useState<TestAccount | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => fetchTestAccount().then(setAccount), []);
  useEffect(() => {
    if (!demoMode) load();
  }, [demoMode, load]);

  if (demoMode) return null;

  const run = async (action: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    try {
      await action();
      after?.();
    } catch (e) {
      Alert.alert("Couldn't do that", e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ padding: 14, gap: 10 }}>
      <View style={{ gap: 2 }}>
        <Body weight="semibold">Test account</Body>
        <Body size={13} tone="muted">
          A pretend player you can switch into to try challenges, games and chats with your own account. Only you can see it, and nothing it does counts toward real records or leaderboards.
        </Body>
      </View>
      {account === undefined ? null : account === null ? (
        <Button label={busy ? 'Making it…' : 'Create test account'} variant="outline" disabled={busy} onPress={() => run(createTestAccount, load)} />
      ) : (
        <>
          <Body size={13} tone="subtle">
            {account.display_name} is your friend, so you can challenge it from your account. Switch in to answer as it.
          </Body>
          <Button
            label={busy ? 'Switching…' : 'Switch to test account'}
            disabled={busy}
            onPress={() => run(enterTestAccount, () => router.replace('/'))}
          />
        </>
      )}
    </Card>
  );
}

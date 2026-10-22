import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Body } from '@/components/ui';
import { useProfile } from '@/lib/profile';
import { leaveTestAccount } from '@/lib/test-account';
import { useTheme } from '@/lib/theme';

// Shown on every screen while you are signed in as the admin test account.
export function TestModeBar() {
  const { profile } = useProfile();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  if (!profile?.is_test) return null;

  const back = async () => {
    setBusy(true);
    try {
      const ok = await leaveTestAccount();
      if (!ok) Alert.alert('Sign in again', 'Your admin session ran out, so sign in as yourself.');
      else router.replace('/');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 62, alignItems: 'center' }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Switch back to your admin account"
        disabled={busy}
        onPress={back}
        style={{ paddingHorizontal: 14, height: 38, borderRadius: 19, backgroundColor: colors.danger, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: busy ? 0.6 : 1 }}>
        <Body size={13} weight="bold" style={{ color: colors.onDanger }}>
          TEST ACCOUNT
        </Body>
        <Body size={13} weight="semibold" style={{ color: colors.onDanger }}>
          Switch back
        </Body>
      </Pressable>
    </View>
  );
}

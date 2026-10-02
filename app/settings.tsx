import { Link } from 'expo-router';
import { View } from 'react-native';

import { Body, Button, Heading, Screen, Segmented } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useProfile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { ThemePreference, useTheme } from '@/lib/theme';

export default function SettingsScreen() {
  const { preference, setPreference } = useTheme();
  const { session } = useAuth();
  const { profile } = useProfile();

  return (
    <Screen>
      <View style={{ gap: 8 }}>
        <Heading>APPEARANCE</Heading>
        <Segmented<ThemePreference>
          value={preference}
          onChange={setPreference}
          options={[
            { value: 'system', label: 'Match phone' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
        <Body size={13} tone="muted">
          Match phone follows your phone&apos;s light or dark setting.
        </Body>
      </View>
      {profile?.is_admin ? (
        <View style={{ gap: 8 }}>
          <Heading>ADMIN</Heading>
          <Link href="/admin/courts" asChild>
            <Button label="Review submitted courts" variant="outline" />
          </Link>
        </View>
      ) : null}
      {session ? <Button label="Log out" variant="outline" onPress={() => supabase?.auth.signOut()} /> : null}
    </Screen>
  );
}

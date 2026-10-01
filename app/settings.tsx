import { View } from 'react-native';

import { Body, Heading, Screen, Segmented } from '@/components/ui';
import { ThemePreference, useTheme } from '@/lib/theme';

export default function SettingsScreen() {
  const { preference, setPreference } = useTheme();

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
    </Screen>
  );
}

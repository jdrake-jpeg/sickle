import { View } from 'react-native';

import { Body } from '@/components/ui';
import { radius } from '@/constants/theme';
import { useTheme } from '@/lib/theme';

import type { CourtMapProps } from './CourtMap';

// react-native-maps has no web version. The web build is only for previews,
// so show a placeholder where the map goes.
export function CourtMap({ height = 220, courts = [], pin }: CourtMapProps) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        height,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}>
      <Body tone="muted" style={{ textAlign: 'center' }}>
        {pin ? 'Map with your pin' : `Map of ${courts.length} courts`} (shows on your phone)
      </Body>
    </View>
  );
}

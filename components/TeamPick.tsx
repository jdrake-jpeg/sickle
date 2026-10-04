import { Pressable, View } from 'react-native';

import { Body, Card } from '@/components/ui';
import { useTheme } from '@/lib/theme';

// One team you can pick: the team name, then who is on it.
export function TeamPick({
  name,
  players,
  detail,
  selected,
  onPress,
}: {
  name: string;
  players?: string;
  detail?: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}>
      <Card highlighted={selected} style={{ paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            borderWidth: 2,
            borderColor: selected ? colors.accentText : colors.borderStrong,
            backgroundColor: selected ? colors.accentFill : 'transparent',
          }}
        />
        <View style={{ flex: 1, gap: 1 }}>
          <Body weight="bold">{name}</Body>
          {players ? (
            <Body size={13} tone="muted">
              {players}
            </Body>
          ) : null}
          {detail ? (
            <Body size={12} tone="subtle">
              {detail}
            </Body>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

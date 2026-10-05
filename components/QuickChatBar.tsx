import { ScrollView, View } from 'react-native';

import { Body, Chip } from '@/components/ui';
import { useTheme } from '@/lib/theme';

// The only way to write in a Sickle chat: tap a quick message and it sends.
export function QuickChatBar({ options, busy, onSend }: { options: string[]; busy: boolean; onSend: (text: string) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.background, paddingTop: 8, paddingBottom: 10, gap: 6 }}>
      <Body size={12} weight="semibold" tone="muted" style={{ paddingHorizontal: 16 }}>
        Quick chat
      </Body>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {options.map((o) => (
          <Chip key={o} label={o} disabled={busy} onPress={() => onSend(o)} />
        ))}
      </ScrollView>
    </View>
  );
}

import { View } from 'react-native';

import { Heading } from '@/components/ui';

// "You" in green against the other side in red.
export function VsLine({ you, them, size = 18 }: { you: string; them: string; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 8 }}>
      <Heading size={size} tone="accent">
        {you}
      </Heading>
      <Heading size={Math.max(12, size - 5)} tone="muted">
        VS
      </Heading>
      <Heading size={size} tone="danger">
        {them}
      </Heading>
    </View>
  );
}

import { Link } from 'expo-router';
import { View } from 'react-native';

import { Body, Button } from '@/components/ui';

// Bottom of the main screens. Keeps the screens simple: the explanations live
// on one page.
export function HelpFooter() {
  return (
    <View style={{ alignItems: 'center', gap: 8, paddingTop: 12, paddingBottom: 4 }}>
      <Body size={13} tone="muted" style={{ textAlign: 'center' }}>
        Having trouble finding something or have questions?
      </Body>
      <Link href="/help" asChild>
        <Button label="How Sickle works" variant="outline" size="sm" />
      </Link>
    </View>
  );
}

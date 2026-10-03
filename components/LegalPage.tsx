import { Linking, View } from 'react-native';

import { Body, Card, Heading, Screen } from '@/components/ui';
import legal from '@/constants/legal.json';

export const supportEmail = legal.supportEmail;

export type LegalSection = { title: string; points: string[] };

// A plain page of headed sections, used for the privacy policy and terms.
export function LegalPage({ updated, intro, sections }: { updated: string; intro: string; sections: LegalSection[] }) {
  return (
    <Screen>
      <Body size={13} tone="muted">
        Last updated {updated}
      </Body>
      <Body>{intro}</Body>
      {sections.map((s) => (
        <Card key={s.title} style={{ padding: 16, gap: 8 }}>
          <Heading>{s.title.toUpperCase()}</Heading>
          {s.points.map((p, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
              <Body tone="accent" weight="bold">
                •
              </Body>
              <Body style={{ flex: 1 }}>{p}</Body>
            </View>
          ))}
        </Card>
      ))}
      <Body tone="muted">
        Questions? Email{' '}
        <Body tone="accent" weight="semibold" onPress={() => Linking.openURL(`mailto:${supportEmail}`)}>
          {supportEmail}
        </Body>
        .
      </Body>
    </Screen>
  );
}

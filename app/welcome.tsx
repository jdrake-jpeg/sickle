import { router } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';

import { Logo } from '@/components/Logo';
import { Body, Button, Card, Display, Heading, InfoDrop, Screen } from '@/components/ui';

const steps: { title: string; body: string }[] = [
  { title: 'Find people', body: 'Search or browse players near you.' },
  { title: 'Challenge them', body: 'Pick singles or doubles, a court and a time.' },
  { title: 'Make friends, then teams', body: 'Add friends. A doubles team is you and a friend.' },
  { title: 'King of the court', body: 'The team with the most wins at a court takes the crown.' },
];

// Shown once after signing up, and any time from Settings.
export default function WelcomeScreen() {
  const { width } = useWindowDimensions();
  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: 4, paddingTop: 8 }}>
        <Logo width={Math.min(width - 48, 340)} />
        <Display size={32}>WELCOME</Display>
      </View>

      {steps.map((s, i) => (
        <Card key={s.title} style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Display size={28} tone="accent">
            {i + 1}
          </Display>
          <View style={{ flex: 1, gap: 2 }}>
            <Heading size={16}>{s.title.toUpperCase()}</Heading>
            <Body size={14} tone="muted">
              {s.body}
            </Body>
          </View>
        </Card>
      ))}

      <InfoDrop title="Look for these arrows for tips">Tap an arrow like this one to read a quick tip.</InfoDrop>

      <Button label="Let's play" size="lg" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </Screen>
  );
}

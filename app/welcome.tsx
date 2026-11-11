import { router } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';

import { Logo } from '@/components/Logo';
import { Body, Button, Card, Display, Heading, InfoDrop, Screen } from '@/components/ui';

const steps: { title: string; body: string }[] = [
  { title: 'Find your people', body: 'Search anyone on Sickle, or browse players near you in Find People. Friends or not, you can play anyone.' },
  { title: 'Challenge them', body: 'Pick singles or doubles, choose who is playing, then a court and a time. Not sure who yet? Leave a spot open and fill it in later.' },
  { title: 'Everyone says OK', body: 'Every player you pick gets the challenge and taps in. The game is on once all of them are. Plans change, so you can edit a challenge any time.' },
  { title: 'Play, then log the score', body: 'After the game, enter the score. The other side confirms and it goes on your record. Already played? Log a game from your Profile.' },
  { title: 'Build your crew', body: 'Add friends, chat, and team up for doubles. People you play with who are not on Sickle yet can be added by name.' },
  { title: 'Take the crown', body: 'Win the most at a court and you become its Court Champ. Check court conditions before you head out, and set the times you like to play.' },
];

// Shown once after signing up, every time you switch into the test account, and any time from Settings.
export default function WelcomeScreen() {
  const { width } = useWindowDimensions();
  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: 4, paddingTop: 8 }}>
        <Logo width={Math.min(width - 48, 340)} />
        <Display size={32}>WELCOME TO SICKLE</Display>
        <Body tone="muted" style={{ textAlign: 'center' }}>
          Pickleball for college players in Utah and Idaho. Find a game, run it back, and climb your court. Here is how to get going.
        </Body>
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

import { router } from 'expo-router';
import { View } from 'react-native';

import { Body, Button, Card, Display, Heading, InfoDrop, Screen } from '@/components/ui';

const steps: { title: string; body: string }[] = [
  {
    title: 'Go to Play and tap Go',
    body: 'Looking to Play tells players nearby you want a game. While it is on, people can find you and send you challenges. Tap Turn off when you are done. Others only see a rough distance, never your exact spot.',
  },
  {
    title: 'Challenge someone',
    body: 'Tap a player from Play or search their username. On their profile pick singles or doubles and one game or best of 3, then pick a court and time. They can accept or decline.',
  },
  {
    title: 'Play, then enter the score',
    body: 'After the game one side enters the score under Challenges and the other side confirms it. Only confirmed games count for wins, records and leaderboards.',
  },
  {
    title: 'Add friends, then make a team',
    body: 'Doubles is team against team. A team is you and a friend, and you can only team up with people who are your friends. Add a friend from the Friends tab, then make a team from your Profile.',
  },
  {
    title: 'Courts have leaderboards',
    body: 'Every court ranks its teams. Be #1 with 6 wins at a court and you get the crown. Not on the list? Add your court. You can add 3 a day.',
  },
  {
    title: 'You choose your alerts',
    body: 'Sickle can tell you about challenges, teams, friend requests and court conditions. Turn each one on or off any time in Settings.',
  },
];

// Shown once after signing up, and any time from Settings.
export default function WelcomeScreen() {
  return (
    <Screen>
      <View style={{ gap: 6, paddingTop: 8 }}>
        <Display size={32}>WELCOME TO SICKLE</Display>
        <Body tone="muted">Here are some things you should know to get the most out of it.</Body>
      </View>

      {steps.map((s, i) => (
        <Card key={s.title} style={{ padding: 16, gap: 6 }}>
          <Heading size={16}>
            {i + 1}. {s.title.toUpperCase()}
          </Heading>
          <Body size={14} tone="muted">
            {s.body}
          </Body>
        </Card>
      ))}

      <InfoDrop title="What do the skill levels mean?">
        From 2.0 (just starting) up to 5.5 and higher (pro). It is the same scale as DUPR. Pick the one that feels right. After a few ranked games, other players can privately rate you and Sickle suggests a level.
      </InfoDrop>
      <InfoDrop title="Look for the little arrows">
        Anywhere you see a small arrow with a question, tap it for a quick explanation of what that part of Sickle is for.
      </InfoDrop>

      <Button label="Got it, let's play" size="lg" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </Screen>
  );
}

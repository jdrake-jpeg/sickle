import { Linking, View } from 'react-native';

import { Body, Button, Card, Heading, Screen } from '@/components/ui';

// The basics of doubles pickleball in plain words, for learning the game or
// settling an argument at the court. Based on the USA Pickleball rulebook;
// the full rulebook has the fine print.
const sections: { title: string; points: string[] }[] = [
  {
    title: 'The court',
    points: [
      'Same size as a badminton court: 20 by 44 feet. The net is 34 inches in the middle.',
      'The kitchen (non-volley zone) is the 7 feet on each side of the net.',
      'A ball that lands on any line is in, except on a serve: a serve that lands on the kitchen line is out.',
    ],
  },
  {
    title: 'Serving',
    points: [
      'Serve underhand. Hit the ball below your waist, with the paddle moving upward.',
      'You can also drop the ball and hit it after it bounces (a drop serve).',
      'Stand behind the baseline and serve diagonally, cross court. It has to clear the kitchen and land in the box across from you.',
      'You get one try. If the serve clips the net and still lands in, it counts and you play on. No do-overs (lets).',
    ],
  },
  {
    title: 'Two-bounce rule',
    points: [
      'The serve has to bounce before the other team hits it.',
      'Then the return has to bounce before the serving team hits it.',
      'After those two bounces, anyone can hit it in the air (volley) or after a bounce.',
    ],
  },
  {
    title: 'The kitchen',
    points: [
      "You can't volley (hit it in the air) while standing in the kitchen or touching its line.",
      "If your momentum carries you into the kitchen after a volley, it's still your fault, even after the ball is dead.",
      'You can go in the kitchen any time to hit a ball that bounced there.',
    ],
  },
  {
    title: 'Scoring (doubles)',
    points: [
      'Only the serving team can score a point.',
      'Games go to 11, and you have to win by 2.',
      'Call the score before every serve as three numbers: your score, their score, then server 1 or 2. Like "4, 2, 1".',
      'The game starts at "0, 0, 2", so the first team only gets one server.',
      'A Sickle match is best of 3 games.',
    ],
  },
  {
    title: 'Who serves',
    points: [
      'The first serve of each turn comes from the right side of the court.',
      'When your team wins a point, the server switches sides with their partner and serves again from the other side.',
      'When the serving team loses a rally, the partner serves next. When both have lost a rally, the serve goes to the other team (side out).',
      "Your score tells you where to stand: when your team's score is even, the player who started on the right should be on the right.",
    ],
  },
  {
    title: 'Faults (you lose the rally)',
    points: [
      'Hitting it out, or into the net.',
      'Volleying before the two bounces are done.',
      'Volleying from the kitchen.',
      'Touching the net, or the net post, with your body, clothes or paddle while the ball is in play.',
      'The ball bouncing twice on your side, or hitting you or your partner.',
    ],
  },
  {
    title: 'Settling arguments',
    points: [
      'Each team calls the lines on its own side. If you are not sure, the ball is in.',
      'Your opponent can ask your team about a call, but your team decides.',
      "If you can't agree on a Sickle score, tap \"That's not right\" on the match. After two corrections an admin decides.",
    ],
  },
];

export default function RulesScreen() {
  return (
    <Screen>
      <Body tone="muted">The quick version for doubles. Learn the game, or settle a call right here.</Body>
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
      <Button label="Full official rulebook" variant="outline" onPress={() => Linking.openURL('https://usapickleball.org/what-is-pickleball/official-rules/')} />
    </Screen>
  );
}

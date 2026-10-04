import { Link } from 'expo-router';
import { View } from 'react-native';

import { SkillGuide } from '@/components/SkillPicker';
import { Body, Button, Display, Heading, InfoDrop, Screen } from '@/components/ui';

type Topic = { title: string; lines: string[] };

const topics: Topic[] = [
  {
    title: 'Looking to Play',
    lines: [
      'On the Play tab, tap Go to tell players nearby you want a game. While it is on, people can find you and challenge you. Tap Turn off when you are done, or it turns itself off when your time is up.',
      'Pick what you are open to right there on the card: singles, doubles, or both. Players looking for the same thing show up on that page.',
      'Other players only see a rough distance, never your exact spot.',
    ],
  },
  {
    title: 'Finding people',
    lines: [
      'The Find people tab is for finding players to challenge or add as friends. Search a name or username, or look at players near your level.',
      'Use the skill and singles or doubles buttons there to narrow the list.',
      'People you played against and have not added yet show up lower on the page.',
    ],
  },
  {
    title: 'Challenges',
    lines: [
      'Open a player and tap the Challenge card. Pick singles or doubles and one game or best of 3. For doubles pick your team and the team of theirs you want to play, then pick a court and time.',
      'They can accept or decline. After you play, one side enters the score under Challenges and the other side confirms it. Only confirmed games count.',
      'New is challenges sent to you. Sent is ones you sent. Upcoming is accepted games. Played is finished matches.',
    ],
  },
  {
    title: 'Singles and doubles',
    lines: [
      'Singles is you against one other player. Everyone has a singles record built in, and you see it on your profile.',
      'Doubles is team against team. A team is you and one friend.',
    ],
  },
  {
    title: 'Teams',
    lines: [
      'On your profile tap Teams to see your teams or make a new one. You can only team up with a friend, and only once with the same person.',
      'If you delete a team it leaves your teams and the leaderboards, and any waiting challenges are cancelled. Past matches stay in history. You can not undo it from the app.',
    ],
  },
  {
    title: 'Friends',
    lines: [
      'Your friends live on your profile. Tap Friends there to chat, see requests, and unfriend.',
      'Friends can chat with you and team up with you. To add someone, search them on Find people and send a request. They have to accept.',
    ],
  },
  {
    title: 'Courts and leaderboards',
    lines: [
      'Every court ranks its teams. Be number one with 6 wins at a court and you earn the crown.',
      'Tap a court to see conditions, lights and its leaderboard. You can report what it is like right now, like wet or crowded.',
    ],
  },
  {
    title: 'Adding a court',
    lines: [
      'Check the list first. If it is already on Sickle, use that one.',
      'Public courts go on the map for everyone after an admin checks them. Private courts (a backyard or gated court) are only seen by you and your friends.',
      'You can add 3 courts a day. A private court can not be within 200 feet of a public court, so use the public one there.',
    ],
  },
  {
    title: 'Alerts',
    lines: [
      'Sickle can tell you about challenges, teams, friend requests, court conditions and messages. Turn each one on or off in Settings under Notifications.',
      'Every alert is also saved in the Alerts button on the Play tab.',
    ],
  },
  {
    title: 'Your profile, name and username',
    lines: [
      'Your username and name are set when you sign up and can not be changed later. Your skill level you can change any time.',
      'Your record, teams and friends are on your profile. You can hide your record from other players in Settings.',
    ],
  },
];

// Everything about how Sickle works, in one place, so the other screens can stay simple.
export default function HelpScreen() {
  return (
    <Screen>
      <View style={{ gap: 6, paddingTop: 8 }}>
        <Display size={30}>HOW SICKLE WORKS</Display>
        <Body tone="muted">Tap a topic to read more.</Body>
      </View>
      {topics.map((t, i) => (
        <InfoDrop key={t.title} title={t.title} startOpen={i === 0}>
          <View style={{ gap: 8 }}>
            {t.lines.map((line) => (
              <Body key={line} size={14} tone="muted">
                {line}
              </Body>
            ))}
          </View>
        </InfoDrop>
      ))}
      <View style={{ gap: 8 }}>
        <Heading size={14}>SKILL LEVELS</Heading>
        <SkillGuide
          title="WHAT DO THE LEVELS MEAN?"
          intro="The number by a name is their skill level, from 2.0 (new) to 5.5 and up (pro). Same scale as DUPR."
        />
      </View>
      <Link href="/rules" asChild>
        <Button label="Pickleball rules" variant="outline" />
      </Link>
    </Screen>
  );
}

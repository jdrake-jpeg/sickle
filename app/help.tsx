import { Link } from 'expo-router';
import { View } from 'react-native';

import { SkillGuide } from '@/components/SkillPicker';
import { Body, Button, Display, Heading, InfoDrop, Screen } from '@/components/ui';

type Topic = { title: string; lines: string[] };

const topics: Topic[] = [
  {
    title: 'Looking to Play',
    lines: [
      'On the Play tab, tap Go to let players nearby find you. It turns itself off when your time is up, or tap Turn off.',
      'Open Options to pick singles, doubles or both, who can challenge you, and how long.',
      'Others only see a rough distance, never your exact spot.',
    ],
  },
  {
    title: 'Finding people',
    lines: [
      'On the Find people tab, search a name or username, or tap Filters.',
      'Filter by rating, distance, friends in common, or show only your friends.',
      'Ratings use the DUPR scale. Open What do the ratings mean? to learn more.',
    ],
  },
  {
    title: 'Challenges',
    lines: [
      'Open a player and use the Challenge card. Pick singles or doubles and one game or best of 3, then a court and time. Times that already passed are greyed out.',
      'For doubles, pick your team. The other player picks their team when they accept.',
      'After you play, one side enters the score and the other confirms it. Only confirmed games count.',
      'New is challenges sent to you. Sent is ones you sent. Upcoming is accepted games. Played is finished matches.',
    ],
  },
  {
    title: 'Chats',
    lines: [
      'Open Chats on your Profile. Chats use quick messages, like Free tonight? or Good game.',
      'Challenges and private feedback between you and a friend show up in the chat too.',
      'When a doubles challenge is accepted, all four players get a game chat. Delete it any time. It only goes away for you.',
    ],
  },
  {
    title: 'Singles and doubles',
    lines: ['Singles is you against one other player. Your singles record is built in.', 'Doubles is team against team. A team is you and one friend.'],
  },
  {
    title: 'Teams',
    lines: [
      'On your Profile tap Teams to see your teams or make one. You can only team up with a friend, and only once with the same person.',
      'Deleting a team removes it from the leaderboards and cancels waiting challenges. Past matches stay in history. You can not undo it.',
    ],
  },
  {
    title: 'Friends',
    lines: [
      'Tap Friends on your Profile. Tap a name to see their profile, or tap Chat to message them.',
      'To add someone, find them on Find people and send a request. They have to accept.',
      'To unfriend, go to the bottom of their profile.',
    ],
  },
  {
    title: 'Courts and leaderboards',
    lines: [
      'The Courts tab shows courts within 10 miles. Tap Show all courts nearby to reach 25 miles.',
      'Every court ranks its teams. Be number one with 6 wins and you take the crown.',
      'Tap a court to see conditions, lights and its leaderboard. You can report how it is right now.',
    ],
  },
  {
    title: 'Adding a court',
    lines: [
      'Check the list first. If the court is already on Sickle, use that one.',
      'Public courts go on the map after an admin checks them. Private courts are only seen by you and your friends.',
      'You can add 3 courts a day. A private court can not be within 200 feet of a public court.',
    ],
  },
  {
    title: 'Alerts',
    lines: [
      'Sickle can alert you about challenges, teams, friend requests, court conditions and messages. Turn each on or off in Settings.',
      'Every alert is also saved under Alerts on the Play tab.',
    ],
  },
  {
    title: 'Your profile',
    lines: [
      'Your name and username are set when you sign up and can not be changed. You can change your rating any time.',
      'Your record is one total. Tap Filters to see singles or doubles, and games against the same or different teams. It changes your match history too.',
      'You can hide your record from other players in Settings.',
    ],
  },
];

// Everything about how Sickle works, in one place, so the other screens can stay simple.
export default function HelpScreen() {
  return (
    <Screen help={false}>
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
        <Heading size={14}>RATINGS</Heading>
        <SkillGuide title="WHAT DO THE RATINGS MEAN?" intro="Ratings run from 2.0 (new) to 5.5 and up (pro). Same scale as DUPR." />
      </View>
      <Link href="/rules" asChild>
        <Button label="Pickleball rules" variant="outline" />
      </Link>
    </Screen>
  );
}

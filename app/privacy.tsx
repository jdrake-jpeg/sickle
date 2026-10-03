import { LegalPage, LegalSection, supportEmail } from '@/components/LegalPage';

// Sickle's privacy policy. Also served at /privacy on the web build, which is
// the link the App Store and Google Play listings point to.
const sections: LegalSection[] = [
  {
    title: 'What we collect',
    points: [
      'Your email address, or your Apple or Google sign-in, so you can log in.',
      'Your profile: username, display name and skill level.',
      'Your games: teams, challenges, scores, confirmations and disputes.',
      'Rough location, only while Looking to Play is on. It is rounded to about 1 km before it is saved and deleted when you turn Looking to Play off.',
      'Things you add: friends, private ratings of other players, blocks, reports, courts you submit and court condition reports.',
    ],
  },
  {
    title: 'What other players see',
    points: [
      'Your username, display name, skill level, teams and match results.',
      'Your record and win rate, unless you turn that off in Settings.',
      'A rough distance to you while you are Looking to Play. Never your exact location.',
      'Private ratings are seen only by the player who was rated, and never change rankings.',
    ],
  },
  {
    title: 'How we use it',
    points: [
      'To run Sickle: matching players, challenges, scores, leaderboards and crowns.',
      'To keep Sickle safe: handling reports, blocks and score disputes.',
      'We do not sell your data, show ads, or track you across other apps.',
    ],
  },
  {
    title: 'Who else handles it',
    points: [
      'Supabase stores Sickle’s database and logins.',
      'Apple and Google, if you choose to sign in with them.',
      'Google Maps finds pickleball courts near the area shown on the map.',
      'Expo delivers the app and its updates.',
      'Each only gets what it needs to do that job.',
    ],
  },
  {
    title: 'Deleting your account',
    points: [
      'In the app, go to Profile, then Settings, then Delete my account.',
      'This deletes your login, profile details, location, friends, ratings, blocks and reports right away.',
      'Matches you already played stay on the other teams’ records, shown as “Deleted player”, so their rankings don’t change.',
      `Can't get into the app? Email ${supportEmail} from your account's email and we will delete it for you.`,
    ],
  },
  {
    title: 'Kids',
    points: ['Sickle is not for children under 13, and we do not knowingly collect their data.'],
  },
  {
    title: 'Changes',
    points: ['If this policy changes, we will update the date at the top and let you know in the app for big changes.'],
  },
];

export default function PrivacyScreen() {
  return (
    <LegalPage
      updated="October 3, 2026"
      intro="Sickle helps pickleball players find games, team up and keep score. This page explains what we collect, why, and how to delete it."
      sections={sections}
    />
  );
}

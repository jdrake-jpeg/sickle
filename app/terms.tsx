import { LegalPage, LegalSection } from '@/components/LegalPage';

// Sickle's terms of use. Also served at /terms on the web build.
const sections: LegalSection[] = [
  {
    title: 'Using Sickle',
    points: [
      'You must be at least 13 to use Sickle.',
      'Keep your login to yourself. You are responsible for what happens on your account.',
      'Use a username and display name that are yours to use and not offensive.',
    ],
  },
  {
    title: 'No abuse, ever',
    points: [
      'Sickle has zero tolerance for harassment, threats, hate, sexual content, spam or impersonation.',
      'Enter honest scores. Faking results or ganging up to push someone down the leaderboard is cheating.',
      'You can block or report any player from their page. We review every report.',
      'We remove content and suspend or delete accounts that break these rules, without warning.',
    ],
  },
  {
    title: 'Scores and rankings',
    points: [
      'A ranked match counts only after the other team confirms it. Disputed scores go back and forth twice, then an admin decides.',
      'Admins can fix or void results to keep the leaderboards fair. Their decision is final.',
    ],
  },
  {
    title: 'Playing safe',
    points: [
      'Sickle helps you meet other players. Meet at public courts and use common sense.',
      'Pickleball is a sport, and you play at your own risk. Sickle is not responsible for injuries, court conditions, or what happens at a game.',
      'Court info like lights and conditions comes from players and may be wrong.',
    ],
  },
  {
    title: 'The fine print',
    points: [
      'Sickle is provided as is, without warranties. We may change or stop features at any time.',
      'You can stop using Sickle and delete your account any time in Settings.',
      'We may update these terms. If you keep using Sickle after a change, you accept the new terms.',
      'These terms are governed by the laws of Idaho, USA.',
    ],
  },
];

export default function TermsScreen() {
  return (
    <LegalPage
      updated="October 3, 2026"
      intro="These are the rules for using Sickle. By making an account, you agree to them."
      sections={sections}
    />
  );
}

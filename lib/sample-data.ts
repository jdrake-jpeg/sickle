// Sample data so every screen can be built and reviewed before the Supabase
// project is connected. Names, courts and records are made up. Replace with
// queries as each feature is wired up.

export type SamplePlayer = { id: string; name: string; username: string; initials: string; skill: number; distance: string };
export type SampleTeam = { id: string; name: string; initials: [string, string]; record: string; detail: string };
export type Score = [number, number];

export const me = {
  name: 'Drake',
  username: 'drake',
  initials: 'D',
  skill: 3.8,
  wins: 23,
  losses: 9,
  crowns: 1,
  preferredCourts: ['Porter Park', 'Smith Park'],
};

export const nearbyPlayers: SamplePlayer[] = [
  { id: 'p1', name: 'Jack Thompson', username: 'jackt', initials: 'JT', skill: 3.8, distance: '0.5 mi' },
  { id: 'p2', name: 'Abby Larsen', username: 'abbyl', initials: 'AL', skill: 3.6, distance: '1 mi' },
  { id: 'p3', name: 'Marcus Bell', username: 'mbell', initials: 'MB', skill: 4.0, distance: '2 mi' },
];

export const myTeams: SampleTeam[] = [
  { id: 'm1', name: 'You + Jack', initials: ['D', 'JT'], record: '14–5', detail: '#5 Porter Park' },
  { id: 'm2', name: 'You + Tyler', initials: ['D', 'TK'], record: '9–4', detail: 'Court Champs at Smith Park' },
];

export const challenges = {
  incoming: [
    { id: 'c1', from: 'Kade + Mason', fromDetail: '#1 Porter Park', to: 'You + Jack', toDetail: '#5 Porter Park', court: 'Porter Park', when: 'Thu · 7:00 PM' },
    { id: 'c2', from: 'Eli + Nate', fromDetail: '#3 Smith Park', to: 'You + Tyler', toDetail: '#1 Smith Park', court: 'Smith Park', when: 'Sat · 10:00 AM' },
  ],
  sent: [{ id: 'c3', from: 'You + Jack', to: 'Sam + Carter', court: 'Porter Park', when: 'Fri · 6:30 PM' }],
  accepted: [{ id: 'c4', us: 'You + Jack', them: 'Josh + Ben', court: 'Porter Park', when: 'Today · 5:00 PM' }],
};

export const pendingResult = {
  id: 'r1',
  court: 'Smith Park',
  when: 'Tue Sep 29 · 7:30 PM',
  submittedBy: 'Ty Sorensen',
  submittedAgo: '12 min ago',
  teamA: 'Ty + Ryan',
  teamB: 'You + Tyler',
  games: [
    [11, 7],
    [9, 11],
    [11, 8],
  ] as Score[],
};

export type LeaderboardRow = { rank: number; name: string; rating: number; record: string; mine?: boolean };

export const courts: {
  id: string;
  name: string;
  meta: string;
  champs: { name: string; record: string };
  leaderboard: LeaderboardRow[];
}[] = [
  {
    id: 'porter',
    name: 'Porter Park',
    meta: 'Outdoor · 6 courts',
    champs: { name: 'Kade + Mason', record: '18–4' },
    leaderboard: [
      { rank: 1, name: 'Kade + Mason', rating: 1112, record: '18–4' },
      { rank: 2, name: 'Sam + Carter', rating: 1074, record: '15–6' },
      { rank: 3, name: 'Lily + Grace', rating: 1051, record: '13–5' },
      { rank: 4, name: 'Josh + Ben', rating: 1022, record: '12–7' },
      { rank: 5, name: 'You + Jack', rating: 1018, record: '14–5', mine: true },
      { rank: 6, name: 'Ty + Ryan', rating: 987, record: '11–7' },
    ],
  },
  {
    id: 'smith',
    name: 'Smith Park',
    meta: 'Outdoor · 4 courts',
    champs: { name: 'You + Tyler', record: '9–4' },
    leaderboard: [
      { rank: 1, name: 'You + Tyler', rating: 1046, record: '9–4', mine: true },
      { rank: 2, name: 'Josh + Ben', rating: 1031, record: '7–3' },
      { rank: 3, name: 'Eli + Nate', rating: 1009, record: '6–5' },
    ],
  },
  {
    id: 'byui',
    name: 'BYU-I courts',
    meta: 'Indoor · 3 courts',
    champs: { name: 'Lily + Grace', record: '6–1' },
    leaderboard: [
      { rank: 1, name: 'Lily + Grace', rating: 1058, record: '6–1' },
      { rank: 2, name: 'Abby + Kate', rating: 1003, record: '3–3' },
    ],
  },
];

export const recentMatches = [
  { id: 'x1', result: 'W' as const, opponent: 'Josh + Ben', detail: 'With Jack · Porter Park', score: '11–6 · 11–9' },
  { id: 'x2', result: 'pending' as const, opponent: 'Ty + Ryan', detail: 'With Tyler · Waiting on you', score: '7–11 · 11–9 · 8–11' },
];

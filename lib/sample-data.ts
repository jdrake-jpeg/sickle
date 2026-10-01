// Sample data so every screen can be built and reviewed before the Supabase
// project is connected. Replace with queries as each feature is wired up.

export type SamplePlayer = { id: string; name: string; initials: string; skill: number; distance: string; court: string };
export type SampleTeam = { id: string; name: string; initials: [string, string]; skill: number; record: string; detail: string };

export const me = {
  name: 'Drake',
  username: 'drake',
  initials: 'D',
  area: 'Rexburg, ID',
  school: 'BYU-Idaho',
  skill: 3.8,
  record: '23–9',
  winRate: '72%',
  streak: 'W3',
  crowns: 1,
};

export const nearbyPlayers: SamplePlayer[] = [
  { id: 'p1', name: 'Jack Thompson', initials: 'JT', skill: 3.8, distance: '0.5 mi', court: 'Porter Park' },
  { id: 'p2', name: 'Abby Larsen', initials: 'AL', skill: 3.6, distance: '1 mi', court: 'BYU-I courts' },
  { id: 'p3', name: 'Marcus Bell', initials: 'MB', skill: 4.0, distance: '2 mi', court: 'Smith Park' },
];

export const teamsLooking: SampleTeam[] = [
  { id: 't1', name: 'Kade + Mason', initials: ['KR', 'MW'], skill: 3.9, record: '18–4', detail: '#1 Porter Park' },
  { id: 't2', name: 'Ty + Ryan', initials: ['TS', 'RN'], skill: 3.7, record: '11–7', detail: 'Smith Park' },
];

export const myTeams: SampleTeam[] = [
  { id: 'm1', name: 'You + Jack', initials: ['D', 'JT'], skill: 3.8, record: '14–5', detail: '#5 Porter Park' },
  { id: 'm2', name: 'You + Tyler', initials: ['D', 'TK'], skill: 3.8, record: '9–4', detail: 'Champs at Smith Park' },
];

export const incomingChallenge = {
  id: 'c1',
  from: { name: 'Kade + Mason', detail: '#1 Porter Park · 18–4' },
  to: { name: 'You + Jack', detail: '#5 Porter Park · 14–5' },
  court: 'Porter Park',
  when: 'Thu · 7:00 PM',
  ranked: true,
  expires: '23h',
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
  ] as [number, number][],
};

export const court = {
  id: 'porter',
  name: 'Porter Park',
  meta: 'Outdoor · 6 courts · 0.8 mi',
  lookingToPlay: 4,
  teamsWantGames: 2,
  matchesThisWeek: 3,
  champs: { name: 'Kade + Mason', held: '12 days', record: '18–4' },
  leaderboard: [
    { rank: 2, name: 'Sam + Carter', record: '15–6', streak: 'W3' },
    { rank: 3, name: 'Lily + Grace', record: '13–5', streak: 'W1' },
    { rank: 4, name: 'Josh + Ben', record: '12–7', streak: 'L2' },
    { rank: 5, name: 'You + Jack', record: '14–5', streak: 'W2', mine: true },
  ],
};

export const rankings = [
  { rank: 1, name: 'Kade + Mason', record: '18–4', home: 'Porter Park' },
  { rank: 2, name: 'Sam + Carter', record: '15–6', home: 'Porter Park' },
  { rank: 3, name: 'Lily + Grace', record: '13–5', home: 'BYU-I courts' },
  { rank: 4, name: 'Josh + Ben', record: '12–7', home: 'Smith Park' },
  { rank: 5, name: 'You + Jack', record: '14–5', home: 'Up 2 this week', mine: true },
  { rank: 6, name: 'Ty + Ryan', record: '11–7', home: 'Smith Park' },
];

export const courtCrowns = [
  { court: 'Porter Park', team: 'Kade + Mason', held: '12 days' },
  { court: 'Smith Park', team: 'You + Tyler', held: '4 days' },
];

export const recentMatches = [
  { id: 'x1', won: true, opponent: 'Josh + Ben', detail: 'With Jack · Porter Park', score: '11–6 · 11–9' },
  { id: 'x2', won: false, opponent: 'Ty + Ryan', detail: 'With Tyler · Pending confirm', score: '7–11 · 11–9 · 8–11' },
];

// Sample data so every screen can be built and reviewed before the Supabase
// project is connected. Names, courts and records are made up. Replace with
// queries as each feature is wired up.

export type SamplePlayer = { id: string; name: string; username: string; initials: string; skill: number; distance: string };
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

export type LeaderboardRow = { rank: number; name: string; rating: number; record: string; mine?: boolean };

// Map pins are placeholder spots around Rexburg, not surveyed locations.
export const courts: {
  id: string;
  name: string;
  meta: string;
  lat: number;
  lng: number;
  champs: { name: string; record: string };
  leaderboard: LeaderboardRow[];
}[] = [
  {
    id: 'porter',
    name: 'Porter Park',
    meta: 'Outdoor · 6 courts',
    lat: 43.8225,
    lng: -111.7935,
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
    lat: 43.8175,
    lng: -111.7765,
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
    lat: 43.8185,
    lng: -111.7835,
    champs: { name: 'Lily + Grace', record: '6–1' },
    leaderboard: [
      { rank: 1, name: 'Lily + Grace', rating: 1058, record: '6–1' },
      { rank: 2, name: 'Abby + Kate', rating: 1003, record: '3–3' },
    ],
  },
];

// Courts players have submitted that are waiting for an admin.
export const pendingCourts = [
  {
    id: 'pending1',
    name: 'Nature Park',
    lat: 43.8335,
    lng: -111.7985,
    address: 'North Rexburg',
    indoor: false,
    court_count: 2,
    submission_note: 'Two courts painted on the tennis courts. Bring your own net.',
    submitter: 'abbyl',
    created_at: '2026-10-01T18:00:00Z',
  },
  {
    id: 'pending2',
    name: 'Madison High gym',
    lat: 43.8295,
    lng: -111.7745,
    address: null,
    indoor: true,
    court_count: 3,
    submission_note: null,
    submitter: 'mbell',
    created_at: '2026-10-01T20:30:00Z',
  },
];

import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { GameScore } from '@/lib/scores';
import { supabase } from '@/lib/supabase';

// Challenges, matches, teams and private ratings. Every write goes through a
// database function that checks who's allowed (see supabase/migrations).

export type ChallengeStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'completed';
export type MatchStatus = 'awaiting_confirmation' | 'confirmed' | 'needs_admin' | 'unconfirmed' | 'voided';

// One challenge you're part of. Scores are [your team, their team].
export type ChallengeRow = {
  challenge_id: string;
  status: ChallengeStatus;
  i_challenged: boolean;
  my_team_id: string;
  my_team_name: string;
  their_team_id: string;
  their_team_name: string;
  court_id: string;
  court_name: string;
  proposed_time: string;
  created_at: string;
  match_id: string | null;
  match_status: MatchStatus | null;
  awaiting_me: boolean;
  i_won: boolean | null;
  games: GameScore[] | null;
  submitted_by_name: string | null;
  played_at: string | null;
};

export type TeamRow = { team_id: string; team_name: string; partner_id?: string; partner_name?: string; wins: number; losses: number };

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

// Demo mode stand-ins, so the screens can be looked at without Supabase.
const demoChallenges: ChallengeRow[] = [
  {
    challenge_id: 'c1', status: 'pending', i_challenged: false, my_team_id: 'm1', my_team_name: 'You + Jack', their_team_id: 't1',
    their_team_name: 'Kade + Mason', court_id: 'porter', court_name: 'Porter Park', proposed_time: hoursFromNow(28), created_at: hoursFromNow(-2),
    match_id: null, match_status: null, awaiting_me: false, i_won: null, games: null, submitted_by_name: null, played_at: null,
  },
  {
    challenge_id: 'c3', status: 'pending', i_challenged: true, my_team_id: 'm1', my_team_name: 'You + Jack', their_team_id: 't3',
    their_team_name: 'Sam + Carter', court_id: 'porter', court_name: 'Porter Park', proposed_time: hoursFromNow(50), created_at: hoursFromNow(-5),
    match_id: null, match_status: null, awaiting_me: false, i_won: null, games: null, submitted_by_name: null, played_at: null,
  },
  {
    challenge_id: 'c4', status: 'accepted', i_challenged: true, my_team_id: 'm1', my_team_name: 'You + Jack', their_team_id: 't4',
    their_team_name: 'Josh + Ben', court_id: 'porter', court_name: 'Porter Park', proposed_time: hoursFromNow(3), created_at: hoursFromNow(-30),
    match_id: null, match_status: null, awaiting_me: false, i_won: null, games: null, submitted_by_name: null, played_at: null,
  },
  {
    challenge_id: 'c5', status: 'accepted', i_challenged: false, my_team_id: 'm2', my_team_name: 'You + Tyler', their_team_id: 't5',
    their_team_name: 'Ty + Ryan', court_id: 'smith', court_name: 'Smith Park', proposed_time: hoursFromNow(-20), created_at: hoursFromNow(-60),
    match_id: 'r1', match_status: 'awaiting_confirmation', awaiting_me: true, i_won: false,
    games: [[7, 11], [11, 9], [8, 11]], submitted_by_name: 'Ty Sorensen', played_at: hoursFromNow(-19),
  },
  {
    challenge_id: 'c6', status: 'completed', i_challenged: true, my_team_id: 'm1', my_team_name: 'You + Jack', their_team_id: 't4',
    their_team_name: 'Josh + Ben', court_id: 'porter', court_name: 'Porter Park', proposed_time: hoursFromNow(-72), created_at: hoursFromNow(-100),
    match_id: 'x1', match_status: 'confirmed', awaiting_me: false, i_won: true, games: [[11, 6], [11, 9]], submitted_by_name: 'Drake', played_at: hoursFromNow(-71),
  },
];

const demoTeams: TeamRow[] = [
  { team_id: 'm1', team_name: 'You + Jack', partner_id: 'p1', partner_name: 'Jack Thompson', wins: 14, losses: 5 },
  { team_id: 'm2', team_name: 'You + Tyler', partner_id: 'p4', partner_name: 'Tyler Kim', wins: 9, losses: 4 },
];

// ---------------------------------------------------------------------------
// Shared challenge list, so the tab badge and screens stay in step.
// ---------------------------------------------------------------------------

let current: ChallengeRow[] | null = null;
let demo = false;
const listeners = new Set<() => void>();

export async function refreshChallenges(demoMode = demo) {
  demo = demoMode;
  if (demoMode || !supabase) {
    current = current ?? demoChallenges;
  } else {
    const { data, error } = await supabase.rpc('my_challenges');
    if (error) return;
    current = (data ?? []) as ChallengeRow[];
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useChallenges(demoMode: boolean) {
  const rows = useSyncExternalStore(subscribe, () => current, () => null);
  useEffect(() => {
    if (current === null) refreshChallenges(demoMode);
  }, [demoMode]);
  return rows;
}

// Keeps the list fresh while the app is open: on launch, when it comes back
// to the front, and every minute.
export function useChallengePolling(demoMode: boolean, signedInAs: string | undefined) {
  useEffect(() => {
    current = null;
    refreshChallenges(demoMode);
    if (demoMode) return;
    const timer = setInterval(() => refreshChallenges(demoMode), 60_000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refreshChallenges(demoMode));
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [demoMode, signedInAs]);
}

// Things waiting on you: challenges to answer and scores to confirm.
export function needsMe(row: ChallengeRow) {
  return (row.status === 'pending' && !row.i_challenged) || (row.match_status === 'awaiting_confirmation' && row.awaiting_me);
}

// Demo mode edits the sample list so buttons visibly do something.
function demoUpdate(id: string, change: Partial<ChallengeRow>) {
  current = (current ?? demoChallenges).map((r) => (r.challenge_id === id ? { ...r, ...change } : r));
  listeners.forEach((l) => l());
}

async function call(fn: string, args: Record<string, unknown>) {
  const { data, error } = await supabase!.rpc(fn, args);
  if (error) throw new Error(error.message);
  await refreshChallenges(false);
  return data;
}

export async function respondToChallenge(demoMode: boolean, id: string, accept: boolean) {
  if (demoMode || !supabase) return demoUpdate(id, { status: accept ? 'accepted' : 'declined' });
  await call('respond_to_challenge', { p_challenge: id, p_accept: accept });
}

export async function cancelChallenge(demoMode: boolean, id: string) {
  if (demoMode || !supabase) return demoUpdate(id, { status: 'cancelled' });
  await call('cancel_challenge', { p_challenge: id });
}

// The database stores scores challenger-first; the app shows yours first.
const toDbOrder = (row: ChallengeRow, mine: GameScore[]) =>
  row.i_challenged ? mine : mine.map(([a, b]) => [b, a] as GameScore);

export async function submitScore(demoMode: boolean, row: ChallengeRow, mine: GameScore[]) {
  if (demoMode || !supabase) {
    const wins = mine.filter(([a, b]) => a > b).length;
    return demoUpdate(row.challenge_id, { match_id: 'demo-' + row.challenge_id, match_status: 'awaiting_confirmation', games: mine, i_won: wins >= 2, submitted_by_name: 'Drake', played_at: new Date().toISOString() });
  }
  await call('submit_match_result', { p_challenge: row.challenge_id, p_games: toDbOrder(row, mine) });
}

export async function confirmResult(demoMode: boolean, row: ChallengeRow) {
  if (demoMode || !supabase) return demoUpdate(row.challenge_id, { status: 'completed', match_status: 'confirmed', awaiting_me: false });
  await call('confirm_match_result', { p_match: row.match_id });
}

// Returns the new match status: back to them, or to an admin.
export async function disputeResult(demoMode: boolean, row: ChallengeRow, mine: GameScore[], note: string): Promise<MatchStatus> {
  if (demoMode || !supabase) {
    demoUpdate(row.challenge_id, { games: mine, awaiting_me: false, i_won: mine.filter(([a, b]) => a > b).length >= 2 });
    return 'awaiting_confirmation';
  }
  return (await call('dispute_match_result', { p_match: row.match_id, p_games: toDbOrder(row, mine), p_note: note.trim() || null })) as MatchStatus;
}

export async function sendChallenge(demoMode: boolean, myTeam: string, theirTeam: string, court: string, when: Date) {
  if (demoMode || !supabase) return;
  await call('send_challenge', { p_my_team: myTeam, p_their_team: theirTeam, p_court: court, p_time: when.toISOString() });
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export async function fetchMyTeams(demoMode: boolean): Promise<TeamRow[]> {
  if (demoMode || !supabase) return demoTeams;
  const { data } = await supabase.rpc('my_teams');
  return (data ?? []) as TeamRow[];
}

export async function fetchPlayerTeams(demoMode: boolean, profileId: string): Promise<TeamRow[]> {
  if (demoMode || !supabase) return [{ team_id: 't-' + profileId, team_name: 'Their team', wins: 3, losses: 2 }];
  const { data } = await supabase.rpc('player_teams', { p_profile: profileId });
  return (data ?? []) as TeamRow[];
}

// ---------------------------------------------------------------------------
// Private ratings
// ---------------------------------------------------------------------------

export type MatchPerson = { profile_id: string; display_name: string; teammate: boolean; my_rating: number | null };
export type RatingSummary = { ratings: number; average: number | null; last_30_days: number };
export type RatingRow = { id: string; match_id: string; received: boolean; other_id: string; other_name: string; skill: number; note: string | null; created_at: string };

const demoRatings: RatingRow[] = [
  { id: 'rt1', match_id: 'x1', received: true, other_id: 'p3', other_name: 'Marcus Bell', skill: 3.5, note: 'Great dinks, work on your third shot.', created_at: hoursFromNow(-48) },
  { id: 'rt2', match_id: 'x1', received: true, other_id: 'p1', other_name: 'Jack Thompson', skill: 4.0, note: null, created_at: hoursFromNow(-47) },
];

export async function fetchMatchPeople(demoMode: boolean, matchId: string): Promise<MatchPerson[]> {
  if (demoMode || !supabase) {
    return [
      { profile_id: 'p1', display_name: 'Jack Thompson', teammate: true, my_rating: null },
      { profile_id: 'p5', display_name: 'Josh Hale', teammate: false, my_rating: null },
      { profile_id: 'p6', display_name: 'Ben Ortiz', teammate: false, my_rating: null },
    ];
  }
  const { data } = await supabase.rpc('match_people', { p_match: matchId });
  return (data ?? []) as MatchPerson[];
}

export async function ratePlayer(demoMode: boolean, matchId: string, playerId: string, skill: number, note: string) {
  if (demoMode || !supabase) return;
  const { error } = await supabase.rpc('rate_player', { p_match: matchId, p_player: playerId, p_skill: skill, p_note: note.trim() || null });
  if (error) throw new Error(error.message);
}

export async function fetchRatingSummary(demoMode: boolean): Promise<RatingSummary> {
  if (demoMode || !supabase) return { ratings: 2, average: 3.5, last_30_days: 2 };
  const { data } = await supabase.rpc('my_rating_summary');
  const row = ((data ?? []) as RatingSummary[])[0];
  return row ?? { ratings: 0, average: null, last_30_days: 0 };
}

export async function fetchMyRatings(demoMode: boolean): Promise<RatingRow[]> {
  if (demoMode || !supabase) return demoRatings;
  const { data } = await supabase.rpc('my_ratings');
  return (data ?? []) as RatingRow[];
}

// ---------------------------------------------------------------------------
// Friend inbox: games and private ratings between you and one friend
// ---------------------------------------------------------------------------

export type FriendActivity = {
  kind: 'game' | 'rating';
  at: string;
  challenge_id: string | null;
  challenge_status: ChallengeStatus | null;
  match_id: string | null;
  match_status: MatchStatus | null;
  my_team_name: string | null;
  their_team_name: string | null;
  same_team: boolean | null;
  court_name: string | null;
  proposed_time: string | null;
  skill: number | null;
  note: string | null;
  from_me: boolean;
};

export async function fetchFriendActivity(demoMode: boolean, friendId: string): Promise<FriendActivity[]> {
  if (demoMode || !supabase) {
    return [
      { kind: 'rating', at: hoursFromNow(-47), challenge_id: null, challenge_status: null, match_id: 'x1', match_status: null, my_team_name: null, their_team_name: null, same_team: null, court_name: null, proposed_time: null, skill: 4.0, note: null, from_me: false },
      { kind: 'game', at: hoursFromNow(-71), challenge_id: 'c6', challenge_status: 'completed', match_id: 'x1', match_status: 'confirmed', my_team_name: 'You + Jack', their_team_name: 'Josh + Ben', same_team: true, court_name: 'Porter Park', proposed_time: hoursFromNow(-72), skill: null, note: null, from_me: true },
    ];
  }
  const { data } = await supabase.rpc('friend_activity', { p_friend: friendId });
  return (data ?? []) as FriendActivity[];
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export function formatWhen(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(today).setHours(0, 0, 0, 0)) / 86_400_000);
  const day =
    days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days === -1 ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return `${day} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

export function timeAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function matchStatusText(row: Pick<ChallengeRow, 'match_status' | 'awaiting_me'>) {
  switch (row.match_status) {
    case 'awaiting_confirmation':
      return row.awaiting_me ? 'Waiting on you to confirm' : 'Waiting on them to confirm';
    case 'confirmed':
      return 'Confirmed by both teams';
    case 'needs_admin':
      return 'An admin is deciding the score';
    case 'unconfirmed':
      return "Nobody confirmed in 72 hours, so it doesn't count";
    case 'voided':
      return 'Thrown out';
    default:
      return '';
  }
}

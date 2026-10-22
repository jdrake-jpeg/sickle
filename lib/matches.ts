import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { BestOf, GameScore } from '@/lib/scores';
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
  // One game or best of 3. Missing on a database from before update 20261010,
  // which only had best of 3.
  best_of?: BestOf;
  // A doubles challenge to a player with no team yet: they pick a partner to accept.
  needs_partner?: boolean;
  // You sent a doubles challenge and have not said who your partner is yet.
  challenger_needs_partner?: boolean;
  // A game with the admin's test player.
  is_test?: boolean;
  // A game that was logged after it happened, with no challenge.
  logged?: boolean;
};

export const bestOfOf = (row: Pick<ChallengeRow, 'best_of'>): BestOf => (row.best_of === 1 ? 1 : 3);

export type TeamRow = {
  team_id: string;
  team_name: string;
  partner_id?: string | null;
  partner_name?: string | null;
  wins: number;
  losses: number;
  // Every player has one built in singles team. Missing on an older database.
  is_singles?: boolean;
};

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
  { team_id: 'm1', team_name: 'You + Jack', partner_id: 'p1', partner_name: 'Jack Thompson', wins: 14, losses: 5, is_singles: false },
  { team_id: 's1', team_name: 'You', partner_id: null, partner_name: null, wins: 3, losses: 1, is_singles: true },
  { team_id: 'm2', team_name: 'You + Tyler', partner_id: 'p4', partner_name: 'Tyler Kim', wins: 9, losses: 4, is_singles: false },
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

// teamId: for a doubles challenge, which of your teams plays.
export async function respondToChallenge(demoMode: boolean, id: string, accept: boolean, teamId?: string | null) {
  if (demoMode || !supabase) return demoUpdate(id, { status: accept ? 'accepted' : 'declined' });
  await call('respond_to_challenge', { p_challenge: id, p_accept: accept, ...(accept && teamId ? { p_team: teamId } : {}) });
}

export async function cancelChallenge(demoMode: boolean, id: string) {
  if (demoMode || !supabase) return demoUpdate(id, { status: 'cancelled' });
  await call('cancel_challenge', { p_challenge: id });
}

// The database stores scores challenger-first; the app shows yours first.
const toDbOrder = (row: ChallengeRow, mine: GameScore[]) =>
  row.i_challenged ? mine : mine.map(([a, b]) => [b, a] as GameScore);

// courtId: where it was really played, if that isn't the planned court.
export async function submitScore(demoMode: boolean, row: ChallengeRow, mine: GameScore[], courtId?: string, courtName?: string) {
  const moved = courtId && courtId !== row.court_id ? courtId : undefined;
  if (demoMode || !supabase) {
    const wins = mine.filter(([a, b]) => a > b).length;
    return demoUpdate(row.challenge_id, { ...(moved ? { court_id: moved, court_name: courtName ?? row.court_name } : {}), match_id: 'demo-' + row.challenge_id, match_status: 'awaiting_confirmation', games: mine, i_won: wins * 2 > mine.length, submitted_by_name: 'Drake', played_at: new Date().toISOString() });
  }
  await call('submit_match_result', { p_challenge: row.challenge_id, p_games: toDbOrder(row, mine), ...(moved ? { p_court: moved } : {}) });
}

export async function confirmResult(demoMode: boolean, row: ChallengeRow) {
  if (demoMode || !supabase) return demoUpdate(row.challenge_id, { status: 'completed', match_status: 'confirmed', awaiting_me: false });
  await call('confirm_match_result', { p_match: row.match_id });
}

// Returns the new match status: back to them, or to an admin.
export async function disputeResult(demoMode: boolean, row: ChallengeRow, mine: GameScore[], note: string): Promise<MatchStatus> {
  if (demoMode || !supabase) {
    demoUpdate(row.challenge_id, { games: mine, awaiting_me: false, i_won: mine.filter(([a, b]) => a > b).length * 2 > mine.length });
    return 'awaiting_confirmation';
  }
  return (await call('dispute_match_result', { p_match: row.match_id, p_games: toDbOrder(row, mine), p_note: note.trim() || null })) as MatchStatus;
}

// Doubles challenge to one player who has no team: they name a partner when they accept.
export async function sendChallengeToPlayer(demoMode: boolean, myTeam: string, playerId: string, court: string, when: Date, bestOf: BestOf = 3) {
  if (demoMode || !supabase) return;
  await call('send_challenge_to_player', {
    p_my_team: myTeam,
    p_player: playerId,
    p_court: court,
    p_time: when.toISOString(),
    ...(bestOf === 1 ? { p_best_of: 1 } : {}),
  });
}

export async function acceptWithPartner(demoMode: boolean, id: string, partnerId: string) {
  if (demoMode || !supabase) return demoUpdate(id, { status: 'accepted', needs_partner: false });
  await call('accept_challenge_with_partner', { p_challenge: id, p_partner: partnerId });
}

export async function sendChallenge(demoMode: boolean, myTeam: string, theirTeam: string, court: string, when: Date, bestOf: BestOf = 3) {
  if (demoMode || !supabase) return;
  await call('send_challenge', {
    p_my_team: myTeam,
    p_their_team: theirTeam,
    p_court: court,
    p_time: when.toISOString(),
    // Only sent for one game, so best of 3 challenges also work before update 20261010 is in the database.
    ...(bestOf === 1 ? { p_best_of: 1 } : {}),
  });
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export async function fetchMyTeams(demoMode: boolean): Promise<TeamRow[]> {
  if (demoMode || !supabase) return demoTeams;
  // Singles included. Falls back to doubles only if the singles update isn't in the database yet.
  const all = await supabase.rpc('my_teams_all');
  if (!all.error) return (all.data ?? []) as TeamRow[];
  const { data } = await supabase.rpc('my_teams');
  return (data ?? []) as TeamRow[];
}

// "Jack Thompson and Tyler Kim" for each team, to show under team names. Empty
// on a database from before the round 2 update, so screens just skip the line.
export async function fetchTeamPlayers(demoMode: boolean, teamIds: string[]): Promise<Record<string, string>> {
  if (teamIds.length === 0) return {};
  if (demoMode || !supabase) {
    const out: Record<string, string> = {};
    for (const id of teamIds) {
      const t = demoTeams.find((x) => x.team_id === id);
      out[id] = t ? (t.is_singles ? 'Just you' : `You and ${t.partner_name}`) : 'Two players';
    }
    return out;
  }
  const { data, error } = await supabase.rpc('team_players', { p_teams: teamIds });
  if (error) return {};
  const out: Record<string, string> = {};
  for (const row of (data ?? []) as { team_id: string; players: string }[]) out[row.team_id] = row.players;
  return out;
}

export function useTeamPlayers(demoMode: boolean, teams: { team_id: string }[]) {
  const key = teams.map((t) => t.team_id).sort().join(',');
  const [players, setPlayers] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    fetchTeamPlayers(demoMode, key ? key.split(',') : []).then((p) => alive && setPlayers(p));
    return () => {
      alive = false;
    };
  }, [demoMode, key]);
  return players;
}

export async function fetchPlayerTeams(demoMode: boolean, profileId: string): Promise<TeamRow[]> {
  if (demoMode || !supabase) return [{ team_id: 't-' + profileId, team_name: 'Their team', wins: 3, losses: 2 }];
  const all = await supabase.rpc('player_teams_all', { p_profile: profileId });
  if (!all.error) return (all.data ?? []) as TeamRow[];
  const { data } = await supabase.rpc('player_teams', { p_profile: profileId });
  return (data ?? []) as TeamRow[];
}

// A confirmed match from one team's (or one player's) point of view.
// Scores are [theirs, opponent's].
export type HistoryRow = {
  challenge_id: string;
  played_at: string;
  court_id: string;
  court_name: string;
  opponent_id: string;
  opponent_name: string;
  won: boolean;
  games: GameScore[] | null;
  best_of: BestOf | null;
  // Only in a player's history: which team they played on, and with whom.
  team_id?: string;
  team_name?: string;
  with_id?: string;
  with_name?: string | null;
  is_singles?: boolean;
};

export type TeamDetail = {
  team_id: string;
  team_name: string;
  custom_name: string | null;
  is_member: boolean;
  wins: number;
  losses: number;
  members: { id: string; name: string; username: string }[];
  is_singles?: boolean;
};

const demoHistory: HistoryRow[] = [
  { challenge_id: 'h1', played_at: hoursFromNow(-30), court_id: 'porter', court_name: 'Porter Park', opponent_id: 't1', opponent_name: 'Kade + Mason', won: true, games: [[11, 7], [11, 9]], best_of: 3, team_id: 'm1', team_name: 'You + Jack', with_id: 'p1', with_name: 'Jack Thompson' },
  { challenge_id: 'h2', played_at: hoursFromNow(-96), court_id: 'porter', court_name: 'Porter Park', opponent_id: 't4', opponent_name: 'Josh + Ben', won: false, games: [[8, 11]], best_of: 1, team_id: 'm1', team_name: 'You + Jack', with_id: 'p1', with_name: 'Jack Thompson' },
];

export async function fetchTeamDetail(demoMode: boolean, teamId: string): Promise<TeamDetail | null> {
  if (demoMode || !supabase) {
    const t = demoTeams.find((x) => x.team_id === teamId) ?? demoTeams[0];
    return {
      team_id: t.team_id,
      team_name: t.team_name,
      custom_name: null,
      is_member: true,
      wins: t.wins,
      losses: t.losses,
      members: [
        { id: 'me', name: 'You', username: 'you' },
        { id: t.partner_id ?? 'p1', name: t.partner_name ?? 'Partner', username: 'partner' },
      ],
    };
  }
  const { data } = await supabase.rpc('team_detail', { p_team: teamId });
  return ((data ?? []) as TeamDetail[])[0] ?? null;
}

export async function fetchTeamHistory(demoMode: boolean, teamId: string): Promise<HistoryRow[]> {
  if (demoMode || !supabase) return demoHistory;
  const { data } = await supabase.rpc('team_history', { p_team: teamId });
  return (data ?? []) as HistoryRow[];
}

export async function fetchPlayerHistory(demoMode: boolean, profileId: string): Promise<HistoryRow[]> {
  if (demoMode || !supabase) return demoHistory;
  const { data } = await supabase.rpc('player_history', { p_profile: profileId });
  return (data ?? []) as HistoryRow[];
}

const missingUpdate = "Team editing isn't in the database yet. Run the newest files from supabase/migrations in the Supabase SQL Editor.";

export async function renameTeam(demoMode: boolean, teamId: string, name: string): Promise<void> {
  if (demoMode || !supabase) return;
  const { error } = await supabase.rpc('update_team_name', { p_team: teamId, p_name: name });
  if (error) throw new Error(error.code === 'PGRST202' ? missingUpdate : error.message);
}

export async function deleteTeam(demoMode: boolean, teamId: string): Promise<void> {
  if (demoMode || !supabase) return;
  const { error } = await supabase.rpc('delete_team', { p_team: teamId });
  if (error) throw new Error(error.code === 'PGRST202' ? missingUpdate : error.message);
}

// ---------------------------------------------------------------------------
// People you add by name, logged games, and editing played games
// ---------------------------------------------------------------------------

export type PersonRow = { profile_id: string; display_name: string; wins: number; losses: number };

const demoPeople: PersonRow[] = [{ profile_id: 'ghost1', display_name: 'Walk On Wes', wins: 0, losses: 1 }];

export async function fetchMyPeople(demoMode: boolean): Promise<PersonRow[]> {
  if (demoMode || !supabase) return demoPeople;
  const { data } = await supabase.rpc('my_people');
  return (data ?? []) as PersonRow[];
}

const missingRound9 = "This isn't in the database yet. Run the newest files from supabase/migrations in the Supabase SQL Editor.";

async function rpcOrThrow<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase!.rpc(fn, args);
  if (error) throw new Error(error.code === 'PGRST202' ? missingRound9 : error.message);
  return data as T;
}

export async function createPerson(demoMode: boolean, name: string): Promise<string> {
  if (demoMode || !supabase) return 'ghost-' + name;
  return rpcOrThrow<string>('create_person', { p_name: name });
}

export async function renamePerson(demoMode: boolean, id: string, name: string) {
  if (demoMode || !supabase) return;
  await rpcOrThrow('rename_person', { p_person: id, p_name: name });
}

export async function deletePerson(demoMode: boolean, id: string) {
  if (demoMode || !supabase) return;
  await rpcOrThrow('delete_person', { p_person: id });
}

// Returns how many games moved onto the account.
export async function linkPerson(demoMode: boolean, personId: string, accountId: string): Promise<number> {
  if (demoMode || !supabase) return 0;
  const n = await rpcOrThrow<number>('link_person_to_account', { p_person: personId, p_account: accountId });
  await refreshChallenges(false);
  return n;
}

// Scores are [your team, their team]. Singles: leave partner and opponent2 out.
export async function logGame(
  demoMode: boolean,
  g: { court: string; playedAt: Date; bestOf: BestOf; games: GameScore[]; partner?: string | null; opponent1: string; opponent2?: string | null },
): Promise<string> {
  if (demoMode || !supabase) return 'demo-logged';
  const id = await rpcOrThrow<string>('log_game', {
    p_court: g.court,
    p_played_at: g.playedAt.toISOString(),
    p_best_of: g.bestOf,
    p_games: g.games,
    p_partner: g.partner ?? null,
    p_opp1: g.opponent1,
    p_opp2: g.opponent2 ?? null,
  });
  await refreshChallenges(false);
  return id;
}

export type DetailTeam = { id: string; name: string; players: { id: string; name: string; placeholder: boolean }[] };
export type PendingChange = {
  id: string;
  kind: 'edit' | 'delete';
  games: GameScore[] | null;
  court_id: string | null;
  court_name: string | null;
  played_at: string | null;
  by_name: string;
  by_side: 'a' | 'b';
};
// Everything about one played match. Scores are team A first.
export type MatchDetail = {
  challenge_id: string;
  match_id: string;
  status: MatchStatus;
  logged: boolean;
  best_of: BestOf;
  scheduled_for: string;
  played_at: string;
  court_id: string;
  court_name: string;
  team_a: DetailTeam;
  team_b: DetailTeam;
  games: GameScore[];
  winner: 'a' | 'b';
  my_side: 'a' | 'b' | null;
  awaiting_side: 'a' | 'b' | null;
  submitted_by_name: string | null;
  pending_change: PendingChange | null;
};

export async function fetchMatchDetail(demoMode: boolean, challengeId: string): Promise<MatchDetail | null> {
  if (demoMode || !supabase) return null;
  const { data, error } = await supabase.rpc('match_detail', { p_challenge: challengeId });
  if (error) return null;
  return (data ?? null) as MatchDetail | null;
}

// Returns 'applied' (it happened) or 'pending' (the other side has to agree).
export async function proposeMatchChange(
  demoMode: boolean,
  matchId: string,
  kind: 'edit' | 'delete',
  edit?: { games?: GameScore[]; court?: string; playedAt?: Date },
): Promise<'applied' | 'pending'> {
  if (demoMode || !supabase) return 'applied';
  const r = await rpcOrThrow<'applied' | 'pending'>('propose_match_change', {
    p_match: matchId,
    p_kind: kind,
    ...(edit?.games ? { p_games: edit.games } : {}),
    ...(edit?.court ? { p_court: edit.court } : {}),
    ...(edit?.playedAt ? { p_played_at: edit.playedAt.toISOString() } : {}),
  });
  await refreshChallenges(false);
  return r;
}

export async function respondToMatchChange(demoMode: boolean, changeId: string, accept: boolean) {
  if (demoMode || !supabase) return;
  await rpcOrThrow('respond_to_match_change', { p_change: changeId, p_accept: accept });
  await refreshChallenges(false);
}

export async function cancelMatchChange(demoMode: boolean, changeId: string) {
  if (demoMode || !supabase) return;
  await rpcOrThrow('cancel_match_change', { p_change: changeId });
}

export type PendingChangeRow = { challenge_id: string; change_id: string; kind: 'edit' | 'delete'; by_name: string; by_team_name: string; court_name: string; created_at: string };

export async function fetchPendingChanges(demoMode: boolean): Promise<PendingChangeRow[]> {
  if (demoMode || !supabase) return [];
  const { data, error } = await supabase.rpc('my_pending_changes');
  if (error) return [];
  return (data ?? []) as PendingChangeRow[];
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

// ---------------------------------------------------------------------------
// Round 10: partner picked later, recent players, find anyone
// ---------------------------------------------------------------------------

export type FoundPlayer = { id: string; name: string; username: string };

export async function setChallengePartner(demoMode: boolean, challengeId: string, partnerId: string): Promise<string | null> {
  if (demoMode || !supabase) return null;
  const team = await rpcOrThrow<string>('set_challenge_partner', { p_challenge: challengeId, p_partner: partnerId });
  await refreshChallenges(false);
  return team;
}

// People you have played with or against, newest first.
export async function fetchRecentPlayers(demoMode: boolean): Promise<{ id: string; name: string; person: boolean }[]> {
  if (demoMode || !supabase) return [];
  const { data } = await supabase.rpc('recent_players');
  return ((data ?? []) as { profile_id: string; display_name: string; is_person: boolean }[]).map((p) => ({ id: p.profile_id, name: p.display_name, person: p.is_person }));
}

export async function searchPlayers(demoMode: boolean, query: string): Promise<FoundPlayer[]> {
  const q = query.trim();
  if (q.length < 2 || demoMode || !supabase) return [];
  const { data } = await supabase.rpc('search_players', { p_query: q });
  return ((data ?? []) as { profile_id: string; display_name: string; username: string }[]).map((p) => ({ id: p.profile_id, name: p.display_name, username: p.username }));
}

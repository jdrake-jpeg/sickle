// Client-side copy of the database's match rules (best_of_three_winner and
// match_winner in supabase/migrations), so players see mistakes before
// submitting. The database stays the authority.

export type GameScore = [number, number];

// A challenge is one game or best of 3. The challenger picks.
export type BestOf = 1 | 3;

export const matchLengthLabel = (bestOf: BestOf) => (bestOf === 1 ? 'One game' : 'Best of 3');

export function isValidGameScore(a: number, b: number) {
  const high = Math.max(a, b);
  const diff = Math.abs(a - b);
  return high >= 11 && diff >= 2 && (high === 11 || diff === 2);
}

export type ScoreCheck = { ok: true; winner: 'a' | 'b' } | { ok: false; error: string };

export function checkBestOfThree(games: GameScore[]): ScoreCheck {
  // Point at a bad game score before complaining about the number of games.
  for (let i = 0; i < games.length; i++) {
    const [a, b] = games[i];
    if (!Number.isInteger(a) || !Number.isInteger(b) || !isValidGameScore(a, b)) {
      return { ok: false, error: `Game ${i + 1}: games go to 11, win by 2.` };
    }
  }
  if (games.length < 2) return { ok: false, error: 'Enter at least two games.' };
  if (games.length > 3) return { ok: false, error: 'A best-of-3 match has 2 or 3 games.' };
  let winsA = 0;
  let winsB = 0;
  for (let i = 0; i < games.length; i++) {
    if (winsA === 2 || winsB === 2) return { ok: false, error: `The match was over before game ${i + 1}.` };
    const [a, b] = games[i];
    if (a > b) winsA++;
    else winsB++;
  }
  if (winsA < 2 && winsB < 2) return { ok: false, error: 'Nobody has won two games yet. Add game 3.' };
  return { ok: true, winner: winsA === 2 ? 'a' : 'b' };
}

// Checks a score list against the match length. A one game match takes
// exactly one game; best of 3 works as it always has.
export function checkMatch(games: GameScore[], bestOf: BestOf): ScoreCheck {
  if (bestOf === 3) return checkBestOfThree(games);
  if (games.length !== 1) return { ok: false, error: 'Enter the score of the one game.' };
  const [a, b] = games[0];
  if (!Number.isInteger(a) || !Number.isInteger(b) || !isValidGameScore(a, b)) {
    return { ok: false, error: 'Games go to 11, win by 2.' };
  }
  return { ok: true, winner: a > b ? 'a' : 'b' };
}

export function formatScores(games: GameScore[]) {
  return games.map(([a, b]) => `${a}–${b}`).join(' · ');
}

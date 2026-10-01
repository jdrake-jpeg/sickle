// Client-side copy of the database's best-of-3 rules
// (best_of_three_winner in supabase/migrations), so players see mistakes
// before submitting. The database stays the authority.

export type GameScore = [number, number];

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

export function formatScores(games: GameScore[]) {
  return games.map(([a, b]) => `${a}–${b}`).join(' · ');
}

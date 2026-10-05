// Filters for a record and match history: singles or doubles, and whether the
// opponent is a team you have played more than once.

export type FormatFilter = 'both' | 'singles' | 'doubles';
export type OpponentFilter = 'all' | 'same' | 'different';
export type RecordFilter = { format: FormatFilter; opponents: OpponentFilter };

export const noRecordFilter: RecordFilter = { format: 'both', opponents: 'all' };

export const recordFilterCount = (f: RecordFilter) => (f.format !== 'both' ? 1 : 0) + (f.opponents !== 'all' ? 1 : 0);

// singles: a one on one match. opponent: who was on the other side (the same
// team or player every time).
export type Filterable = { singles: boolean; opponent: string };

export function applyRecordFilter<T extends Filterable>(items: T[], f: RecordFilter): T[] {
  const times = new Map<string, number>();
  for (const i of items) times.set(i.opponent, (times.get(i.opponent) ?? 0) + 1);
  return items.filter((i) => {
    if (f.format !== 'both' && (f.format === 'singles') !== i.singles) return false;
    if (f.opponents === 'all') return true;
    const repeat = (times.get(i.opponent) ?? 0) > 1;
    return f.opponents === 'same' ? repeat : !repeat;
  });
}

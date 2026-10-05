import { supabase } from '@/lib/supabase';

// When a player likes to play: a 2 hour window for each day they pick. The
// window's start is minutes after midnight. Days are 0 (Sunday) to 6 (Saturday).
export type PreferredTimes = Record<number, number>;

export const noPreferredTimes: PreferredTimes = {};

// Monday first, the way people read a week.
export const weekDays: { value: number; label: string; long: string }[] = [
  { value: 1, label: 'Mon', long: 'Monday' },
  { value: 2, label: 'Tue', long: 'Tuesday' },
  { value: 3, label: 'Wed', long: 'Wednesday' },
  { value: 4, label: 'Thu', long: 'Thursday' },
  { value: 5, label: 'Fri', long: 'Friday' },
  { value: 6, label: 'Sat', long: 'Saturday' },
  { value: 0, label: 'Sun', long: 'Sunday' },
];

export const windowMinutes = 120;
// The latest a window can start is 10 PM.
export const latestStart = 22 * 60;
export const defaultStart = 18 * 60;

export const hasPreferred = (p: PreferredTimes | null | undefined): p is PreferredTimes => Boolean(p && Object.keys(p).length > 0);

type Clock = { hour: number; minute: number; ampm: 'AM' | 'PM' };

function clock(minutes: number): Clock {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  return { hour: h24 % 12 || 12, minute: m % 60, ampm: h24 >= 12 ? 'PM' : 'AM' };
}

const clockText = (c: Clock) => (c.minute === 0 ? `${c.hour}` : `${c.hour}:${String(c.minute).padStart(2, '0')}`);

// "7 to 9 PM", "10 AM to 12 PM".
export function windowText(start: number): string {
  const a = clock(start);
  const b = clock(start + windowMinutes);
  return a.ampm === b.ampm ? `${clockText(a)} to ${clockText(b)} ${b.ampm}` : `${clockText(a)} ${a.ampm} to ${clockText(b)} ${b.ampm}`;
}

// "3:30 PM"
export const timeText = (minutes: number) => {
  const c = clock(minutes);
  return `${c.hour}:${String(c.minute).padStart(2, '0')} ${c.ampm}`;
};

// "Mon, Wed 7 to 9 PM · Sat 10 AM to 12 PM". Days with the same window are grouped.
export function preferredText(p: PreferredTimes): string {
  const groups = new Map<number, string[]>();
  for (const d of weekDays) {
    const start = p[d.value];
    if (start === undefined) continue;
    groups.set(start, [...(groups.get(start) ?? []), d.label]);
  }
  return [...groups.entries()]
    .sort((a, b) => weekDays.findIndex((d) => d.label === a[1][0]) - weekDays.findIndex((d) => d.label === b[1][0]))
    .map(([start, days]) => `${days.join(', ')} ${windowText(start)}`)
    .join(' · ');
}

// The next few times a window starts, soonest first. A window that is still
// open today starts now (rounded up to the minute).
export function nextWindows(p: PreferredTimes, count = 3, from = new Date()): Date[] {
  if (!hasPreferred(p)) return [];
  const out: Date[] = [];
  for (let i = 0; i < 14 && out.length < count; i++) {
    const day = new Date(from);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + i);
    const minutes = p[day.getDay()];
    if (minutes === undefined) continue;
    const start = new Date(day.getTime());
    start.setMinutes(minutes);
    const end = new Date(start.getTime() + windowMinutes * 60_000);
    if (end.getTime() <= from.getTime()) continue;
    if (start.getTime() < from.getTime()) {
      const now = new Date(from);
      now.setSeconds(0, 0);
      now.setMinutes(now.getMinutes() + 1);
      out.push(now);
    } else {
      out.push(start);
    }
  }
  return out;
}

type Row = { preferred_windows: Record<string, number> | null };

const fromRow = (r: Row | null | undefined): PreferredTimes =>
  Object.fromEntries(Object.entries(r?.preferred_windows ?? {}).map(([day, start]) => [Number(day), Number(start)]));

// Anyone signed in can read these, like the rest of a profile. Quietly empty
// on a database that doesn't have the newest update yet.
export async function fetchPreferredTimes(demoMode: boolean, profileId: string | undefined): Promise<PreferredTimes> {
  if (demoMode || !supabase || !profileId) return noPreferredTimes;
  const { data, error } = await supabase.from('profiles').select('preferred_windows').eq('id', profileId).maybeSingle();
  return error ? noPreferredTimes : fromRow(data as Row | null);
}

export async function fetchPreferredTimesFor(demoMode: boolean, profileIds: string[]): Promise<Record<string, PreferredTimes>> {
  if (demoMode || !supabase || profileIds.length === 0) return {};
  const { data, error } = await supabase.from('profiles').select('id, preferred_windows').in('id', profileIds);
  if (error) return {};
  return Object.fromEntries(((data ?? []) as (Row & { id: string })[]).map((r) => [r.id, fromRow(r)]));
}

export async function savePreferredTimes(demoMode: boolean, profileId: string, p: PreferredTimes): Promise<void> {
  if (demoMode || !supabase) return;
  const { error } = await supabase.from('profiles').update({ preferred_windows: p }).eq('id', profileId);
  if (error) throw new Error(error.message);
}

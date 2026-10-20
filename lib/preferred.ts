import { supabase } from '@/lib/supabase';

// When a player likes to play: a stretch of the day, from a start time to an
// end time, for each day they pick, like 12 PM to 8 PM. Both are minutes after
// midnight. Days are 0 (Sunday) to 6 (Saturday).
export type PreferredWindow = { start: number; end: number };
export type PreferredTimes = Record<number, PreferredWindow>;

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

// A new day starts as a 2 hour window you can stretch. The latest a window can
// start is 11:30 PM, and it always ends the same day (midnight at the latest).
export const windowMinutes = 120;
export const minWindow = 30;
export const latestStart = 23 * 60 + 30;
export const defaultStart = 18 * 60;
export const dayEnd = 24 * 60;

// Keeps a window sensible: it starts by 11:30 PM and runs at least 30 minutes, ending by midnight.
export function fixWindow(start: number, end: number): PreferredWindow {
  const s = Math.max(0, Math.min(latestStart, start));
  return { start: s, end: Math.max(s + minWindow, Math.min(dayEnd, end)) };
}

export const hasPreferred = (p: PreferredTimes | null | undefined): p is PreferredTimes => Boolean(p && Object.keys(p).length > 0);

type Clock = { hour: number; minute: number; ampm: 'AM' | 'PM' };

function clock(minutes: number): Clock {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  return { hour: h24 % 12 || 12, minute: m % 60, ampm: h24 >= 12 ? 'PM' : 'AM' };
}

const clockText = (c: Clock) => (c.minute === 0 ? `${c.hour}` : `${c.hour}:${String(c.minute).padStart(2, '0')}`);

// "7 to 9 PM", "10 AM to 12 PM".
export function windowText(w: PreferredWindow): string {
  const a = clock(w.start);
  const b = clock(w.end);
  return a.ampm === b.ampm ? `${clockText(a)} to ${clockText(b)} ${b.ampm}` : `${clockText(a)} ${a.ampm} to ${clockText(b)} ${b.ampm}`;
}

// "3:30 PM"
export const timeText = (minutes: number) => {
  const c = clock(minutes);
  return `${c.hour}:${String(c.minute).padStart(2, '0')} ${c.ampm}`;
};

// "Mon, Wed 7 to 9 PM · Sat 10 AM to 12 PM". Days with the same window are grouped.
export function preferredText(p: PreferredTimes): string {
  const groups = new Map<string, { w: PreferredWindow; days: string[] }>();
  for (const d of weekDays) {
    const w = p[d.value];
    if (w === undefined) continue;
    const key = `${w.start}-${w.end}`;
    const g = groups.get(key) ?? { w, days: [] };
    g.days.push(d.label);
    groups.set(key, g);
  }
  return [...groups.values()]
    .sort((a, b) => weekDays.findIndex((d) => d.label === a.days[0]) - weekDays.findIndex((d) => d.label === b.days[0]))
    .map(({ w, days }) => `${days.join(', ')} ${windowText(w)}`)
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
    const w = p[day.getDay()];
    if (w === undefined) continue;
    const start = new Date(day.getTime());
    start.setMinutes(w.start);
    const end = new Date(day.getTime());
    end.setMinutes(w.end);
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

// preferred_windows holds each day's start. preferred_ends (added later) holds
// each day's end; a day without one is the old 2 hour window.
type Row = { preferred_windows: Record<string, number> | null; preferred_ends?: Record<string, number> | null };

const fromRow = (r: Row | null | undefined): PreferredTimes =>
  Object.fromEntries(
    Object.entries(r?.preferred_windows ?? {}).map(([day, start]) => {
      const end = r?.preferred_ends?.[day];
      return [Number(day), fixWindow(Number(start), end === undefined ? Number(start) + windowMinutes : Number(end))];
    }),
  );

// Anyone signed in can read these, like the rest of a profile. Quietly empty
// on a database that doesn't have the newest update yet.
export async function fetchPreferredTimes(demoMode: boolean, profileId: string | undefined): Promise<PreferredTimes> {
  if (demoMode || !supabase || !profileId) return noPreferredTimes;
  const { data, error } = await supabase.from('profiles').select('preferred_windows, preferred_ends').eq('id', profileId).maybeSingle();
  return error ? noPreferredTimes : fromRow(data as Row | null);
}

export async function fetchPreferredTimesFor(demoMode: boolean, profileIds: string[]): Promise<Record<string, PreferredTimes>> {
  if (demoMode || !supabase || profileIds.length === 0) return {};
  const { data, error } = await supabase.from('profiles').select('id, preferred_windows, preferred_ends').in('id', profileIds);
  if (error) return {};
  return Object.fromEntries(((data ?? []) as (Row & { id: string })[]).map((r) => [r.id, fromRow(r)]));
}

export async function savePreferredTimes(demoMode: boolean, profileId: string, p: PreferredTimes): Promise<void> {
  if (demoMode || !supabase) return;
  const starts = Object.fromEntries(Object.entries(p).map(([d, w]) => [d, w.start]));
  const ends = Object.fromEntries(Object.entries(p).map(([d, w]) => [d, w.end]));
  const { error } = await supabase.from('profiles').update({ preferred_windows: starts, preferred_ends: ends }).eq('id', profileId);
  if (error) {
    // A database from before the end time update only keeps the start.
    const old = await supabase.from('profiles').update({ preferred_windows: starts }).eq('id', profileId);
    if (old.error) throw new Error(old.error.message);
  }
}

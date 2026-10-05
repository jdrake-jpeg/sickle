import { supabase } from '@/lib/supabase';

// When a player likes to play: some days of the week and one 2 hour window.
// start is minutes after midnight. Days are 0 (Sunday) to 6 (Saturday).
export type PreferredTimes = { days: number[]; start: number | null };

export const noPreferredTimes: PreferredTimes = { days: [], start: null };

// Monday first, the way people read a week.
export const weekDays: { value: number; label: string }[] = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

export const windowMinutes = 120;
// Windows start between 5 AM and 10 PM, in half hour steps.
export const earliestStart = 5 * 60;
export const latestStart = 22 * 60;
export const defaultStart = 18 * 60;

export const hasPreferred = (p: PreferredTimes | null | undefined): p is PreferredTimes => Boolean(p && p.days.length > 0 && p.start !== null);

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

export function daysText(days: number[]): string {
  const picked = weekDays.filter((d) => days.includes(d.value));
  if (picked.length === 7) return 'Every day';
  if (picked.length === 5 && picked.every((d) => d.value >= 1 && d.value <= 5)) return 'Weekdays';
  if (picked.length === 2 && days.includes(0) && days.includes(6)) return 'Weekends';
  return picked.map((d) => d.label).join(', ');
}

// "Mon, Wed · 7 to 9 PM"
export const preferredText = (p: PreferredTimes) => (hasPreferred(p) ? `${daysText(p.days)} · ${windowText(p.start!)}` : '');

// The next few times a window starts, soonest first. A window that is still
// open today starts now (rounded up to the minute).
export function nextWindows(p: PreferredTimes, count = 3, from = new Date()): Date[] {
  if (!hasPreferred(p)) return [];
  const out: Date[] = [];
  for (let i = 0; i < 14 && out.length < count; i++) {
    const day = new Date(from);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + i);
    if (!p.days.includes(day.getDay())) continue;
    const start = new Date(day.getTime());
    start.setMinutes(p.start!);
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

type Row = { preferred_days: number[] | null; preferred_start: number | null };

const fromRow = (r: Row | null | undefined): PreferredTimes => ({ days: r?.preferred_days ?? [], start: r?.preferred_start ?? null });

// Anyone signed in can read these, like the rest of a profile. Quietly empty
// on a database that doesn't have the newest update yet.
export async function fetchPreferredTimes(demoMode: boolean, profileId: string | undefined): Promise<PreferredTimes> {
  if (demoMode || !supabase || !profileId) return noPreferredTimes;
  const { data, error } = await supabase.from('profiles').select('preferred_days, preferred_start').eq('id', profileId).maybeSingle();
  return error ? noPreferredTimes : fromRow(data as Row | null);
}

export async function fetchPreferredTimesFor(demoMode: boolean, profileIds: string[]): Promise<Record<string, PreferredTimes>> {
  if (demoMode || !supabase || profileIds.length === 0) return {};
  const { data, error } = await supabase.from('profiles').select('id, preferred_days, preferred_start').in('id', profileIds);
  if (error) return {};
  return Object.fromEntries(((data ?? []) as (Row & { id: string })[]).map((r) => [r.id, fromRow(r)]));
}

export async function savePreferredTimes(demoMode: boolean, profileId: string, p: PreferredTimes): Promise<void> {
  if (demoMode || !supabase) return;
  const { error } = await supabase
    .from('profiles')
    .update({ preferred_days: p.days, preferred_start: p.days.length > 0 ? (p.start ?? defaultStart) : null })
    .eq('id', profileId);
  if (error) throw new Error(error.message);
}

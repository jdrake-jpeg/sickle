import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';

import { useAuth } from '@/lib/auth';
import { courts as sampleCourts, pendingCourts as samplePending } from '@/lib/sample-data';
import { supabase } from '@/lib/supabase';

export type Court = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string | null;
  indoor: boolean;
  court_count: number | null;
};

export type PendingCourt = Court & {
  submission_note: string | null;
  submitter: string | null;
  created_at: string;
};

export type LeaderboardRow = { rank: number; team_id: string; team_name: string; rating: number; wins: number; losses: number };

export function courtMeta(court: Pick<Court, 'indoor' | 'court_count'>) {
  const where = court.indoor ? 'Indoor' : 'Outdoor';
  if (!court.court_count) return where;
  return `${where} · ${court.court_count} ${court.court_count === 1 ? 'court' : 'courts'}`;
}

const courtColumns = 'id, name, lat, lng, address, indoor, court_count';

// Approved courts: the ones on the map that host challenges.
export function useCourts() {
  const { demoMode } = useAuth();
  const [courts, setCourts] = useState<Court[] | null>(null);

  const reload = useCallback(async () => {
    if (demoMode || !supabase) {
      setCourts(
        sampleCourts.map((c) => ({
          id: c.id,
          name: c.name,
          lat: c.lat,
          lng: c.lng,
          address: null,
          indoor: c.meta.startsWith('Indoor'),
          court_count: Number(c.meta.match(/(\d+) courts/)?.[1]) || null,
        })),
      );
      return;
    }
    const { data } = await supabase.from('courts').select(courtColumns).eq('status', 'approved').order('name');
    setCourts((data as Court[] | null) ?? []);
  }, [demoMode]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { courts, reload };
}

// Courts waiting for an admin. Row level security only returns them to admins
// (and to whoever submitted them).
export async function fetchPendingCourts(demoMode: boolean): Promise<PendingCourt[]> {
  if (demoMode || !supabase) return samplePending;
  const { data } = await supabase
    .from('courts')
    .select(`${courtColumns}, submission_note, created_at, submitter:profiles!courts_submitted_by_fkey(username)`)
    .eq('status', 'pending')
    .order('created_at');
  return ((data ?? []) as unknown as (Court & { submission_note: string | null; created_at: string; submitter: { username: string } | null })[]).map(
    (c) => ({ ...c, submitter: c.submitter?.username ?? null }),
  );
}

export async function fetchLeaderboard(courtId: string): Promise<LeaderboardRow[]> {
  if (!supabase) return [];
  const { data } = await supabase.rpc('court_leaderboard', { p_court: courtId });
  return (data as LeaderboardRow[] | null) ?? [];
}

// Ids of the teams you're on, to highlight your rank on leaderboards.
export async function fetchMyTeamIds(userId: string | undefined): Promise<Set<string>> {
  if (!supabase || !userId) return new Set();
  const { data } = await supabase.from('teams').select('id').or(`player_low.eq.${userId},player_high.eq.${userId}`);
  return new Set((data ?? []).map((t: { id: string }) => t.id));
}

// Opens the court in Apple Maps or Google Maps.
export function openDirections(court: Pick<Court, 'lat' | 'lng' | 'name'>) {
  const label = encodeURIComponent(court.name);
  const url =
    Platform.OS === 'ios'
      ? `https://maps.apple.com/?ll=${court.lat},${court.lng}&q=${label}`
      : `https://www.google.com/maps/search/?api=1&query=${court.lat},${court.lng}`;
  Linking.openURL(url);
}

// A court Google knows about. Not on Sickle until someone adds it.
export type GoogleCourt = { place_id: string; name: string; address: string | null; lat: number; lng: number };

function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

// Pickleball courts Google knows about near a spot, minus ones already on
// Sickle. Empty when the find-courts function isn't set up yet.
export async function findGoogleCourts(near: { lat: number; lng: number }, listed: Court[]): Promise<GoogleCourt[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.functions.invoke('find-courts', { body: { lat: near.lat, lng: near.lng } });
  if (error || !data?.courts) return [];
  return (data.courts as GoogleCourt[]).filter((g) => !listed.some((c) => milesBetween(c, g) < 0.06));
}

// How a court is right now, from players who are there. Reports fade after
// 6 hours (court_conditions in supabase/migrations).
export type Condition = 'good' | 'wet' | 'windy' | 'icy' | 'crowded';
export type ConditionReport = { condition: Condition; note: string | null; reporter_name: string; created_at: string };

export const conditions: { value: Condition; label: string; emoji: string }[] = [
  { value: 'good', label: 'Good to play', emoji: '☀️' },
  { value: 'wet', label: 'Wet', emoji: '💧' },
  { value: 'windy', label: 'Windy', emoji: '💨' },
  { value: 'icy', label: 'Icy', emoji: '🧊' },
  { value: 'crowded', label: 'Crowded', emoji: '👥' },
];

export const conditionInfo = (c: Condition) => conditions.find((x) => x.value === c) ?? conditions[0];

export async function fetchCourtConditions(demoMode: boolean, courtId: string): Promise<ConditionReport[]> {
  if (demoMode || !supabase) {
    return courtId === 'porter'
      ? [{ condition: 'windy', note: 'Gusty on the north courts', reporter_name: 'Jack Thompson', created_at: new Date(Date.now() - 40 * 60_000).toISOString() }]
      : [];
  }
  const { data } = await supabase.rpc('court_conditions', { p_court: courtId });
  return (data ?? []) as ConditionReport[];
}

export async function fetchLatestConditions(demoMode: boolean): Promise<Record<string, { condition: Condition; created_at: string }>> {
  if (demoMode || !supabase) return { porter: { condition: 'windy', created_at: new Date(Date.now() - 40 * 60_000).toISOString() } };
  const { data } = await supabase.rpc('latest_court_conditions');
  return Object.fromEntries(((data ?? []) as { court_id: string; condition: Condition; created_at: string }[]).map((r) => [r.court_id, r]));
}

export async function reportCondition(demoMode: boolean, courtId: string, condition: Condition, note: string) {
  if (demoMode || !supabase) return;
  const { error } = await supabase.rpc('report_court_condition', { p_court: courtId, p_condition: condition, p_note: note.trim() || null });
  if (error) throw new Error(error.message);
}

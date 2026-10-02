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
  has_lights?: boolean | null;
  lights_until?: number | null;
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

// Pickleball courts mapped near a spot, minus ones already on Sickle. Uses
// Google (the find-courts function) when it's set up, and otherwise
// OpenStreetMap, which is free and needs no key.
export async function findGoogleCourts(near: { lat: number; lng: number }, listed: Court[]): Promise<GoogleCourt[]> {
  let found: GoogleCourt[] = [];
  if (supabase) {
    const { data, error } = await supabase.functions.invoke('find-courts', { body: { lat: near.lat, lng: near.lng } });
    if (!error && data?.courts) found = data.courts as GoogleCourt[];
  }
  if (found.length === 0) found = await findOsmCourts(near);
  return found.filter((g) => !listed.some((c) => milesBetween(c, g) < 0.06));
}

type OsmElement = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

// Pickleball courts on OpenStreetMap within about 10 miles. Each court there
// is often its own shape, so ones within ~100 m are merged into one pin.
export async function findOsmCourts(near: { lat: number; lng: number }): Promise<GoogleCourt[]> {
  const query = `[out:json][timeout:15];(nwr["sport"~"pickleball"](around:16000,${near.lat},${near.lng}););out center tags 200;`;
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { elements?: OsmElement[] };
    const spots: (GoogleCourt & { named: boolean; count: number })[] = [];
    for (const el of json.elements ?? []) {
      const lat = el.lat ?? el.center?.lat;
      const lng = el.lon ?? el.center?.lon;
      if (lat === undefined || lng === undefined) continue;
      const name = el.tags?.name;
      const near100m = spots.find((s) => milesBetween(s, { lat, lng }) < 0.06);
      if (near100m) {
        near100m.count++;
        if (name && !near100m.named) Object.assign(near100m, { name, named: true });
        continue;
      }
      spots.push({ place_id: `osm:${el.type}/${el.id}`, name: name ?? 'Pickleball courts', address: el.tags?.['addr:street'] ?? null, lat, lng, named: Boolean(name), count: 1 });
    }
    return spots
      .sort((a, b) => milesBetween(near, a) - milesBetween(near, b))
      .slice(0, 40)
      .map(({ place_id, name, address, lat, lng }) => ({ place_id, name, address, lat, lng }));
  } catch {
    return [];
  }
}

// Courts already on Sickle, nearest first, with how far away they are.
export function courtsNear<T extends { lat: number; lng: number }>(here: { lat: number; lng: number } | null, list: T[]): (T & { miles: number | null })[] {
  if (!here) return list.map((c) => ({ ...c, miles: null }));
  return list.map((c) => ({ ...c, miles: milesBetween(here, c) })).sort((a, b) => a.miles - b.miles);
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

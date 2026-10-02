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

import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { CourtMap } from '@/components/CourtMap';
import { Body, Button, Card, Display, Heading, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { courtMeta, fetchLeaderboard, fetchMyTeamIds, fetchPendingCourts, useCourts } from '@/lib/courts';
import { getLocationIfAllowed, LatLng } from '@/lib/location';
import { useProfile } from '@/lib/profile';
import { courts as sampleCourts } from '@/lib/sample-data';
import { useTheme } from '@/lib/theme';

type Standing = { teams: number; champs: { name: string; record: string } | null; myRank: number | null };

export default function CourtsScreen() {
  const { colors } = useTheme();
  const { demoMode, session } = useAuth();
  const { profile } = useProfile();
  const { courts, reload } = useCourts();
  const [standings, setStandings] = useState<Record<string, Standing>>({});
  const [pendingCount, setPendingCount] = useState(0);
  const [here, setHere] = useState<LatLng | null>(null);
  const isAdmin = Boolean(profile?.is_admin);

  useEffect(() => {
    getLocationIfAllowed().then(setHere);
  }, []);

  // Refresh when coming back from adding or reviewing a court.
  useFocusEffect(
    useCallback(() => {
      reload();
      if (isAdmin) fetchPendingCourts(demoMode).then((p) => setPendingCount(p.length));
    }, [reload, isAdmin, demoMode]),
  );

  useEffect(() => {
    if (!courts) return;
    if (demoMode) {
      setStandings(
        Object.fromEntries(
          sampleCourts.map((c) => [c.id, { teams: c.leaderboard.length, champs: c.champs, myRank: c.leaderboard.find((r) => r.mine)?.rank ?? null }]),
        ),
      );
      return;
    }
    let cancelled = false;
    (async () => {
      const mine = await fetchMyTeamIds(session?.user.id);
      const entries = await Promise.all(
        courts.map(async (c) => {
          const rows = await fetchLeaderboard(c.id);
          const top = rows[0];
          const standing: Standing = {
            teams: rows.length,
            champs: top ? { name: top.team_name, record: `${top.wins}–${top.losses}` } : null,
            myRank: rows.find((r) => mine.has(r.team_id))?.rank ?? null,
          };
          return [c.id, standing] as const;
        }),
      );
      if (!cancelled) setStandings(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [courts, demoMode, session?.user.id]);

  return (
    <Screen>
      <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Display>COURTS</Display>
        <Link href="/court/new" asChild>
          <Button label="Add a court" variant="outline" size="sm" />
        </Link>
      </View>

      {isAdmin && pendingCount > 0 ? (
        <Link href="/admin/courts" asChild>
          <Pressable accessibilityRole="link">
            <Card style={{ padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderColor: colors.danger }}>
              <Body weight="semibold">
                {pendingCount} {pendingCount === 1 ? 'court is' : 'courts are'} waiting for review
              </Body>
              <Body weight="bold" tone="accent">
                Review
              </Body>
            </Card>
          </Pressable>
        </Link>
      ) : null}

      <CourtMap
        height={240}
        center={here}
        showsUserLocation={Boolean(here)}
        courts={(courts ?? []).map((c) => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, subtitle: courtMeta(c) }))}
        onCourtPress={(id) => router.push(`/court/${id}`)}
      />
      <Body tone="muted">Win at a court to climb its leaderboard and take the crown.</Body>

      {courts && courts.length === 0 ? (
        <Card style={{ padding: 16, gap: 6 }}>
          <Body weight="semibold">No courts yet</Body>
          <Body tone="muted">Know a spot? Add it and an admin will check it&apos;s real.</Body>
        </Card>
      ) : null}

      {(courts ?? []).map((court) => {
        const standing = standings[court.id];
        return (
          <Link key={court.id} href={`/court/${court.id}`} asChild>
            <Pressable accessibilityRole="link">
              <Card style={{ padding: 16, gap: 12, borderRadius: 20 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ gap: 2, flex: 1 }}>
                    <Heading size={20}>{court.name.toUpperCase()}</Heading>
                    <Body size={13} tone="muted">
                      {courtMeta(court)}
                      {standing ? ` · ${standing.teams} ${standing.teams === 1 ? 'team' : 'teams'} ranked` : ''}
                    </Body>
                  </View>
                  {standing?.myRank ? (
                    <Body size={13} weight="bold" tone="accent">
                      You&apos;re #{standing.myRank}
                    </Body>
                  ) : null}
                </View>
                {standing?.champs ? (
                  <View style={{ backgroundColor: colors.accentFill, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, gap: 1 }}>
                    <Heading size={11} tone="onAccent" style={{ letterSpacing: 1 }}>
                      COURT CHAMPS
                    </Heading>
                    <Body weight="bold" tone="onAccent">
                      {standing.champs.name} · {standing.champs.record}
                    </Body>
                  </View>
                ) : standing ? (
                  <Body size={13} tone="muted">
                    No champs yet. Win the first ranked match here to take the crown.
                  </Body>
                ) : null}
              </Card>
            </Pressable>
          </Link>
        );
      })}
    </Screen>
  );
}

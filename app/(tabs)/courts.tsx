import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { CourtMap } from '@/components/CourtMap';
import { HelpFooter } from '@/components/HelpFooter';
import { Body, Button, Card, Display, Heading, Screen, SearchField } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  addMapCourt,
  Condition,
  conditionInfo,
  courtMeta,
  CourtWithMiles,
  fetchLatestConditions,
  fetchLeaderboard,
  fetchMyTeamIds,
  fetchPendingCourts,
  findGoogleCourts,
  GoogleCourt,
  nearbyCourts,
  nearbyMiles,
  searchCourts,
  useCourts,
} from '@/lib/courts';
import { formatMiles } from '@/lib/format';
import { getLocationIfAllowed, LatLng, rexburg } from '@/lib/location';
import { timeAgo } from '@/lib/matches';
import { championWins } from '@/lib/play';
import { useProfile } from '@/lib/profile';
import { courts as sampleCourts } from '@/lib/sample-data';
import { useTheme } from '@/lib/theme';
import { useClearOnBlur } from '@/lib/use-clear-on-blur';

type Standing = { teams: number; champs: { name: string; record: string } | null; leader: { name: string; wins: number } | null; myRank: number | null };

// Courts shown before "Show all".
const listSize = 10;

export default function CourtsScreen() {
  const { colors } = useTheme();
  const { demoMode, session } = useAuth();
  const { isAdmin } = useProfile();
  const { courts, reload } = useCourts();
  const [standings, setStandings] = useState<Record<string, Standing>>({});
  const [pendingCount, setPendingCount] = useState(0);
  const [here, setHere] = useState<LatLng | null>(null);
  const [located, setLocated] = useState(false);
  const [suggestions, setSuggestions] = useState<GoogleCourt[]>([]);
  const [latest, setLatest] = useState<Record<string, { condition: Condition; created_at: string }>>({});
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    getLocationIfAllowed().then((spot) => {
      setHere(spot);
      setLocated(true);
    });
  }, []);

  // Mapped pickleball courts nearby that aren't on Sickle yet.
  useEffect(() => {
    if (demoMode || !courts || !located) return;
    findGoogleCourts(here ?? rexburg, courts).then(setSuggestions);
  }, [demoMode, courts, located, here]);

  // Refresh when coming back from adding or reviewing a court.
  useFocusEffect(
    useCallback(() => {
      reload();
      fetchLatestConditions(demoMode).then(setLatest);
      if (isAdmin) fetchPendingCourts(demoMode).then((p) => setPendingCount(p.length));
    }, [reload, isAdmin, demoMode]),
  );

  useClearOnBlur(() => setQuery(''));

  const searching = query.trim().length > 0;
  const nearby = useMemo(() => nearbyCourts(here, courts ?? []), [here, courts]);
  const results = useMemo(() => searchCourts(here, courts ?? [], query), [here, courts, query]);
  const everything = useMemo(() => nearbyCourts(null, courts ?? []), [courts]);
  const pool: CourtWithMiles[] = searching ? results : showAll ? everything : nearby;
  const shown = searching || showAll ? pool : pool.slice(0, listSize);
  const shownKey = shown.map((c) => c.id).join(',');

  // Standings only for the courts on screen.
  useEffect(() => {
    if (!courts) return;
    if (demoMode) {
      setStandings(
        Object.fromEntries(
          sampleCourts.map((c) => [
            c.id,
            { teams: c.leaderboard.length, champs: c.champs, leader: null, myRank: c.leaderboard.find((r) => r.mine)?.rank ?? null },
          ]),
        ),
      );
      return;
    }
    let cancelled = false;
    (async () => {
      const mine = await fetchMyTeamIds(session?.user.id);
      const entries = await Promise.all(
        shown.map(async (c) => {
          const rows = await fetchLeaderboard(c.id);
          const top = rows[0];
          const crowned = top && top.wins >= championWins && !c.is_private;
          const standing: Standing = {
            teams: rows.length,
            champs: crowned ? { name: top.team_name, record: `${top.wins}–${top.losses}` } : null,
            leader: top ? { name: top.team_name, wins: top.wins } : null,
            myRank: rows.find((r) => mine.has(r.team_id))?.rank ?? null,
          };
          return [c.id, standing] as const;
        }),
      );
      if (!cancelled) setStandings((old) => ({ ...old, ...Object.fromEntries(entries) }));
    })();
    return () => {
      cancelled = true;
    };
    // shownKey stands in for the list of courts on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey, demoMode, session?.user.id]);

  // A mapped court goes straight into Sickle, then you land on its page.
  const addFromMap = (g: GoogleCourt) =>
    Alert.alert(`Add ${g.name} to Sickle?`, 'It goes live right away, so you can challenge people and play ranked matches there.', [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Add it',
        onPress: async () => {
          setAdding(g.place_id);
          try {
            const id = await addMapCourt(demoMode, g);
            await reload();
            setSuggestions((list) => list.filter((x) => x.place_id !== g.place_id));
            router.push(`/court/${id}`);
          } catch (e) {
            Alert.alert("Couldn't add it", e instanceof Error ? e.message : 'Try again.');
          } finally {
            setAdding(null);
          }
        },
      },
    ]);

  const hiddenCount = everything.length - nearby.length;

  return (
    <Screen>
      <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Display>COURTS</Display>
        <Link href="/court/new" asChild>
          <Button label="Add a court" variant="outline" size="sm" />
        </Link>
      </View>

      {isAdmin ? (
        <Link href="/admin/courts" asChild>
          <Pressable accessibilityRole="link">
            <Card
              style={{
                padding: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                borderColor: pendingCount > 0 ? colors.danger : colors.border,
              }}>
              {/* The text takes the leftover room and wraps, so Review always stays on screen. */}
              <Body weight="semibold" style={{ flex: 1 }}>
                {pendingCount > 0
                  ? `${pendingCount} ${pendingCount === 1 ? 'court is' : 'courts are'} waiting for review`
                  : 'Admin: review courts or add ones found on the map'}
              </Body>
              <Body weight="bold" tone="accent" style={{ flexShrink: 0 }}>
                Review
              </Body>
            </Card>
          </Pressable>
        </Link>
      ) : null}

      <SearchField label="Search courts" placeholder="Court name or street" value={query} onChangeText={setQuery} />
      {searching ? null : (
        <>
          <CourtMap
            height={240}
            center={here}
            showsUserLocation={Boolean(here)}
            courts={(courts ?? []).map((c) => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, subtitle: courtMeta(c) }))}
            onCourtPress={(id) => router.push(`/court/${id}`)}
            suggestions={suggestions.map((g) => ({ id: g.place_id, name: g.name, lat: g.lat, lng: g.lng }))}
            onSuggestionPress={(placeId) => {
              const g = suggestions.find((x) => x.place_id === placeId);
              if (g) addFromMap(g);
            }}
          />
          <Link href="/court/map" asChild>
            <Button label="Open full screen map" variant="outline" size="sm" />
          </Link>
        </>
      )}

      {!searching && suggestions.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Heading size={14} style={{ letterSpacing: 1 }}>
            ON THE MAP, NOT ON SICKLE YET
          </Heading>
          <Body size={13} tone="muted">
            These are mapped pickleball courts (the gray pins). Tap Add and one becomes a Sickle court right away.
          </Body>
          {suggestions.map((g) => (
            <Card key={g.place_id} style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Body weight="semibold">{g.name}</Body>
                {g.address ? (
                  <Body size={13} tone="muted">
                    {g.address}
                  </Body>
                ) : null}
              </View>
              <Button label={adding === g.place_id ? 'Adding…' : 'Add'} size="sm" disabled={adding !== null} onPress={() => addFromMap(g)} />
            </Card>
          ))}
        </View>
      ) : null}

      {courts && courts.length === 0 ? (
        <Card style={{ padding: 16, gap: 6 }}>
          <Body weight="semibold">No courts yet</Body>
          <Body tone="muted">Add the one you play at. It takes a minute.</Body>
        </Card>
      ) : null}

      <View style={{ gap: 10 }}>
        <Heading size={14} style={{ letterSpacing: 1 }}>
          {searching ? `COURTS MATCHING “${query.trim().toUpperCase()}”` : showAll ? 'ALL COURTS' : here ? `COURTS WITHIN ${nearbyMiles} MILES` : 'COURTS'}
        </Heading>
        {searching && results.length === 0 ? <Body tone="muted">No court matches that. Try part of the name, or add it with Add a court.</Body> : null}
        {!searching && courts && courts.length > 0 && nearby.length === 0 && !showAll ? (
          <Body tone="muted">No Sickle courts within {nearbyMiles} miles of you yet. Add one from the map above, or show every court.</Body>
        ) : null}

        {shown.map((court) => {
          const standing = standings[court.id];
          const now = latest[court.id];
          return (
            <Link key={court.id} href={`/court/${court.id}`} asChild>
              <Pressable accessibilityRole="link">
                <Card style={{ padding: 16, gap: 12, borderRadius: 20 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ gap: 2, flex: 1 }}>
                      <Heading size={20}>{court.name.toUpperCase()}</Heading>
                      <Body size={13} tone="muted">
                        {[
                          court.is_private ? '🔒 Private, friends only' : null,
                          courtMeta(court),
                          court.miles !== null ? formatMiles(Math.round(court.miles * 10) / 10) : null,
                          standing ? `${standing.teams} ${standing.teams === 1 ? 'team' : 'teams'} ranked` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Body>
                    </View>
                    {standing?.myRank ? (
                      <Body size={13} weight="bold" tone="accent">
                        You&apos;re #{standing.myRank}
                      </Body>
                    ) : null}
                  </View>
                  {now ? (
                    <Body size={14} weight="semibold">
                      {conditionInfo(now.condition).emoji} {conditionInfo(now.condition).label} · {timeAgo(now.created_at)}
                    </Body>
                  ) : null}
                  {standing?.champs ? (
                    <View style={{ backgroundColor: colors.accentFill, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, gap: 1 }}>
                      <Heading size={11} tone="onAccent" style={{ letterSpacing: 1 }}>
                        👑 COURT CHAMPS
                      </Heading>
                      <Body weight="bold" tone="onAccent">
                        {standing.champs.name} · {standing.champs.record}
                      </Body>
                    </View>
                  ) : standing ? (
                    <Body size={13} tone="muted">
                      {court.is_private
                        ? 'Private courts have no crown. Play here to track games with friends.'
                        : standing.leader
                          ? `${standing.leader.name} leads. Win ${championWins} here and finish #1 to take the crown.`
                          : `No champs yet. Win ${championWins} ranked matches here and finish #1 to take the crown.`}
                    </Body>
                  ) : null}
                </Card>
              </Pressable>
            </Link>
          );
        })}

        {!searching && !showAll && (pool.length > listSize || hiddenCount > 0) ? (
          <Button
            label={hiddenCount > 0 ? `Show all ${everything.length} courts` : `Show ${pool.length - listSize} more`}
            variant="outline"
            onPress={() => setShowAll(true)}
          />
        ) : null}
        {!searching && showAll ? <Button label="Back to nearby courts" variant="ghost" onPress={() => setShowAll(false)} /> : null}
      </View>

      <Card style={{ padding: 16, gap: 8 }}>
        <Heading size={14} style={{ letterSpacing: 1 }}>
          DON&apos;T SEE YOUR COURT?
        </Heading>
        <Body size={14}>1. Look for a gray pin on the map. Tap it, then Add, and it becomes a Sickle court right away.</Body>
        <Body size={14}>2. No gray pin? Tap Add a court, drop a pin on the courts and send it. An admin checks it and it goes live.</Body>
        <Body size={14}>3. Just for you and your friends, like a backyard court? Add a court and pick Private. It never goes to an admin and only friends see it.</Body>
        <Link href="/court/new" asChild>
          <Button label="Add a court" variant="outline" size="sm" style={{ alignSelf: 'flex-start' }} />
        </Link>
      </Card>

      <HelpFooter />
    </Screen>
  );
}

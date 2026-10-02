import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { CourtMap } from '@/components/CourtMap';
import { Body, Button, Card, Display, Heading, Screen, SectionHeader } from '@/components/ui';
import { fonts } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { Court, courtMeta, fetchLeaderboard, fetchMyTeamIds, openDirections } from '@/lib/courts';
import { courts as sampleCourts } from '@/lib/sample-data';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

type Row = { rank: number; name: string; rating: number; record: string; mine: boolean };

export default function CourtScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { demoMode, session } = useAuth();
  const [court, setCourt] = useState<Court | null | undefined>(undefined);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (demoMode || !supabase) {
      const sample = sampleCourts.find((c) => c.id === id);
      setCourt(
        sample
          ? { id: sample.id, name: sample.name, lat: sample.lat, lng: sample.lng, address: null, indoor: sample.meta.startsWith('Indoor'), court_count: Number(sample.meta.match(/(\d+) courts/)?.[1]) || null }
          : null,
      );
      setRows((sample?.leaderboard ?? []).map((r) => ({ ...r, mine: Boolean(r.mine) })));
      return;
    }
    (async () => {
      const { data } = await supabase!.from('courts').select('id, name, lat, lng, address, indoor, court_count').eq('id', id).maybeSingle();
      setCourt((data as Court | null) ?? null);
      if (!data) return;
      const [board, mine] = await Promise.all([fetchLeaderboard(id), fetchMyTeamIds(session?.user.id)]);
      setRows(
        board.map((r) => ({ rank: r.rank, name: r.team_name, rating: r.rating, record: `${r.wins}–${r.losses}`, mine: mine.has(r.team_id) })),
      );
    })();
  }, [demoMode, id, session?.user.id]);

  if (court === undefined) return <Screen>{null}</Screen>;
  if (!court) {
    return (
      <Screen>
        <Body tone="muted">This court isn&apos;t on the list.</Body>
      </Screen>
    );
  }

  const champs = rows[0];
  const myRank = rows.find((row) => row.mine)?.rank;

  return (
    <Screen>
      <Stack.Screen options={{ title: court.name }} />
      <View style={{ gap: 4 }}>
        <Display size={28}>{court.name.toUpperCase()}</Display>
        <Body size={13} tone="muted">
          {[courtMeta(court), court.address].filter(Boolean).join(' · ')}
        </Body>
      </View>

      <CourtMap height={160} interactive={false} center={court} courts={[{ id: court.id, name: court.name, lat: court.lat, lng: court.lng }]} />
      <Button label="Directions" variant="outline" size="sm" onPress={() => openDirections(court)} />

      {champs ? (
        <View style={{ backgroundColor: colors.accentFill, borderRadius: 18, padding: 16, gap: 2 }}>
          <Heading size={12} tone="onAccent" style={{ letterSpacing: 1 }}>
            COURT CHAMPS
          </Heading>
          <Heading size={22} tone="onAccent">
            {champs.name}
          </Heading>
          <Body size={13} weight="medium" tone="onAccent">
            {champs.record} at {court.name}
          </Body>
        </View>
      ) : null}

      <View style={{ gap: 6 }}>
        <SectionHeader title="Leaderboard" detail="Doubles teams" />
        {rows.length === 0 ? (
          <Card style={{ padding: 16 }}>
            <Body tone="muted">No ranked matches here yet. Challenge a team to a match at {court.name} to get on the board.</Body>
          </Card>
        ) : null}
        {rows.map((row) => (
          <Card
            key={row.rank}
            highlighted={row.mine}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, minHeight: 52 }}>
            <Body style={{ fontFamily: fonts.numeric, width: 20 }} tone={row.mine ? 'accent' : 'default'}>
              {row.rank}
            </Body>
            <View style={{ flex: 1 }}>
              <Body weight={row.mine ? 'bold' : 'semibold'}>{row.name}</Body>
              <Body size={12} tone="muted">
                {row.record} · {row.rating}
              </Body>
            </View>
            {myRank && row.rank < myRank ? <Button label="Challenge" variant="dangerOutline" size="sm" /> : null}
          </Card>
        ))}
        <Body size={12} tone="muted">
          Only confirmed matches count. Beating a higher-rated team moves you up more.
        </Body>
      </View>
    </Screen>
  );
}

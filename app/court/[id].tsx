import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { CourtMap } from '@/components/CourtMap';
import { Body, Button, Card, Chip, Display, Field, Heading, Screen, SectionHeader } from '@/components/ui';
import { fonts } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import {
  Condition,
  conditionInfo,
  ConditionReport,
  conditions,
  Court,
  courtMeta,
  fetchCourtConditions,
  fetchLeaderboard,
  fetchMyTeamIds,
  openDirections,
  reportCondition,
} from '@/lib/courts';
import { timeAgo } from '@/lib/matches';
import { courts as sampleCourts } from '@/lib/sample-data';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

type Row = { rank: number; teamId: string; name: string; rating: number; record: string; mine: boolean };

export default function CourtScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { demoMode, session } = useAuth();
  const [court, setCourt] = useState<Court | null | undefined>(undefined);
  const [rows, setRows] = useState<Row[]>([]);
  const [reports, setReports] = useState<ConditionReport[]>([]);
  const [picked, setPicked] = useState<Condition | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const loadReports = useCallback(() => {
    fetchCourtConditions(demoMode, id).then(setReports);
  }, [demoMode, id]);
  useEffect(loadReports, [loadReports]);

  const sendReport = async () => {
    if (!picked) return;
    setSending(true);
    try {
      await reportCondition(demoMode, id, picked, note);
      if (demoMode) setReports((r) => [{ condition: picked, note: note.trim() || null, reporter_name: 'You', created_at: new Date().toISOString() }, ...r]);
      else loadReports();
      setPicked(null);
      setNote('');
    } catch (e) {
      Alert.alert("Couldn't post that", e instanceof Error ? e.message : 'Try again.');
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (demoMode || !supabase) {
      const sample = sampleCourts.find((c) => c.id === id);
      setCourt(
        sample
          ? { id: sample.id, name: sample.name, lat: sample.lat, lng: sample.lng, address: null, indoor: sample.meta.startsWith('Indoor'), court_count: Number(sample.meta.match(/(\d+) courts/)?.[1]) || null }
          : null,
      );
      setRows((sample?.leaderboard ?? []).map((r) => ({ ...r, teamId: `${id}-${r.rank}`, mine: Boolean(r.mine) })));
      return;
    }
    (async () => {
      const { data } = await supabase!.from('courts').select('id, name, lat, lng, address, indoor, court_count').eq('id', id).maybeSingle();
      setCourt((data as Court | null) ?? null);
      if (!data) return;
      const [board, mine] = await Promise.all([fetchLeaderboard(id), fetchMyTeamIds(session?.user.id)]);
      setRows(
        board.map((r) => ({ rank: r.rank, teamId: r.team_id, name: r.team_name, rating: r.rating, record: `${r.wins}–${r.losses}`, mine: mine.has(r.team_id) })),
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
  const latest = reports[0];

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

      <Card style={{ padding: 16, gap: 10 }}>
        <SectionHeader title="Conditions now" detail="Last 6 hours" />
        {latest ? (
          <View style={{ gap: 6 }}>
            <Heading size={20}>
              {conditionInfo(latest.condition).emoji} {conditionInfo(latest.condition).label.toUpperCase()}
            </Heading>
            {reports.map((r, i) => (
              <Body key={i} size={13} tone="muted">
                {conditionInfo(r.condition).label}
                {r.note ? `: ${r.note}` : ''} · {r.reporter_name}, {timeAgo(r.created_at)}
              </Body>
            ))}
          </View>
        ) : (
          <Body tone="muted">No reports yet today. At the courts? Tell everyone how it is.</Body>
        )}
        <Body size={13} weight="semibold" tone="muted">
          How is it right now?
        </Body>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {conditions.map((c) => (
            <Chip key={c.value} label={`${c.emoji} ${c.label}`} selected={picked === c.value} onPress={() => setPicked(picked === c.value ? null : c.value)} />
          ))}
        </View>
        {picked ? (
          <>
            <Field label="Anything else? (optional)" placeholder="Puddles on court 2" value={note} onChangeText={setNote} maxLength={140} />
            <Button label={sending ? 'Posting…' : 'Post it'} size="sm" disabled={sending} onPress={sendReport} />
          </>
        ) : null}
      </Card>

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
            key={row.teamId}
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
            {!row.mine ? (
              <Link href={{ pathname: '/challenge/new', params: { team: row.teamId, teamName: row.name, court: court.id } }} asChild>
                <Button label="Challenge" variant="dangerOutline" size="sm" />
              </Link>
            ) : null}
          </Card>
        ))}
        <Body size={12} tone="muted">
          Only confirmed matches count. Beating a higher-rated team moves you up more.
        </Body>
      </View>
    </Screen>
  );
}

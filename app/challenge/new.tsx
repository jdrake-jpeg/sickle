import { Link, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { Body, Button, Card, Chip, Heading, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useCourts } from '@/lib/courts';
import { fetchMyTeams, sendChallenge, TeamRow } from '@/lib/matches';

const times = [
  { label: '7 AM', hour: 7 },
  { label: '9 AM', hour: 9 },
  { label: 'Noon', hour: 12 },
  { label: '3 PM', hour: 15 },
  { label: '5 PM', hour: 17 },
  { label: '6 PM', hour: 18 },
  { label: '7 PM', hour: 19 },
  { label: '8 PM', hour: 20 },
  { label: '9 PM', hour: 21 },
];

function nextDays() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${d.getDate()}`;
    return { label, date: d };
  });
}

// Challenge a team: pick which of your teams plays, where, and when.
export default function NewChallengeScreen() {
  const { team, teamName, court } = useLocalSearchParams<{ team: string; teamName?: string; court?: string }>();
  const { demoMode } = useAuth();
  const { courts } = useCourts();
  const [teams, setTeams] = useState<TeamRow[] | null>(null);
  const [myTeam, setMyTeam] = useState<string | null>(null);
  const [courtId, setCourtId] = useState<string | null>(court ?? null);
  const [day, setDay] = useState(0);
  const [hour, setHour] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const days = nextDays();

  useEffect(() => {
    fetchMyTeams(demoMode).then((t) => {
      setTeams(t);
      if (t.length === 1) setMyTeam(t[0].team_id);
    });
  }, [demoMode]);

  const when = hour === null ? null : new Date(new Date(days[day].date).setHours(hour));
  const inPast = when !== null && when.getTime() < Date.now();
  const ready = myTeam && courtId && when && !inPast;

  const send = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      await sendChallenge(demoMode, myTeam, team, courtId, when);
      Alert.alert('Challenge sent', `${teamName || 'They'} can accept or decline. You'll see it under Challenges.`);
      router.back();
    } catch (e) {
      Alert.alert("Couldn't send it", e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (teams && teams.length === 0) {
    return (
      <Screen>
        <Card style={{ padding: 16, gap: 10 }}>
          <Heading>YOU NEED A PARTNER FIRST</Heading>
          <Body tone="muted">Challenges are 2 vs 2. Open a friend&apos;s page and tap Create team, then come back.</Body>
          <Link href="/friends" asChild>
            <Button label="Find a partner" />
          </Link>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Heading size={22}>CHALLENGE {(teamName || 'this team').toUpperCase()}</Heading>
      <Body tone="muted">Ranked, best of 3. It counts once both teams agree on the score.</Body>

      <View style={{ gap: 8 }}>
        <Body weight="semibold">Your team</Body>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(teams ?? []).map((t) => (
            <Chip key={t.team_id} label={t.team_name} selected={myTeam === t.team_id} onPress={() => setMyTeam(t.team_id)} />
          ))}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Body weight="semibold">Court</Body>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(courts ?? []).map((c) => (
            <Chip key={c.id} label={c.name} selected={courtId === c.id} onPress={() => setCourtId(c.id)} />
          ))}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Body weight="semibold">Day</Body>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {days.map((d, i) => (
            <Chip key={d.label} label={d.label} selected={day === i} onPress={() => setDay(i)} />
          ))}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Body weight="semibold">Time</Body>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {times.map((t) => (
            <Chip key={t.hour} label={t.label} selected={hour === t.hour} onPress={() => setHour(t.hour)} />
          ))}
        </View>
        {inPast ? (
          <Body size={13} tone="danger">
            That time already passed. Pick a later one.
          </Body>
        ) : null}
      </View>

      <Button label={busy ? 'Sending…' : 'Send challenge'} size="lg" disabled={busy || !ready} onPress={send} />
    </Screen>
  );
}

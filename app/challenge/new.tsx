import { Link, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { TeamPick } from '@/components/TeamPick';
import { Body, Button, Card, Chip, Heading, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { courtsNear, nearbyMiles, useCourts } from '@/lib/courts';
import { formatMiles } from '@/lib/format';
import { getLocationIfAllowed, LatLng } from '@/lib/location';
import { fetchMyTeams, fetchTeamDetail, sendChallenge, TeamRow, useTeamPlayers } from '@/lib/matches';
import { BestOf, matchLengthLabel } from '@/lib/scores';

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
  const { team, teamName, court, myTeam: myTeamParam, bestOf: bestOfParam } = useLocalSearchParams<{ team: string; teamName?: string; court?: string; myTeam?: string; bestOf?: string }>();
  const { demoMode } = useAuth();
  const { courts } = useCourts();
  const [teams, setTeams] = useState<TeamRow[] | null>(null);
  const [myTeam, setMyTeam] = useState<string | null>(myTeamParam ?? null);
  // Singles teams only play singles teams, doubles only doubles.
  const [singles, setSingles] = useState<boolean | null>(null);
  const [courtId, setCourtId] = useState<string | null>(court ?? null);
  const [day, setDay] = useState(0);
  const [hour, setHour] = useState<number | null>(null);
  const [bestOf, setBestOf] = useState<BestOf>(bestOfParam === '1' ? 1 : 3);
  const [busy, setBusy] = useState(false);
  const days = nextDays();
  const [here, setHere] = useState<LatLng | null>(null);
  const allSorted = courtsNear(here, courts ?? []);
  const [moreCourts, setMoreCourts] = useState(false);
  // Nearby courts first. The one you came from is always in the list.
  const nearList = allSorted.filter((c) => c.miles === null || c.miles <= nearbyMiles || c.id === court);
  const sorted = moreCourts ? allSorted : nearList.slice(0, 8);

  useEffect(() => {
    getLocationIfAllowed().then(setHere);
  }, []);

  // Pick the closest court to start with, unless one was passed in.
  useEffect(() => {
    if (!courtId && here && sorted.length > 0) setCourtId(sorted[0].id);
  }, [courtId, here, sorted]);

  useEffect(() => {
    fetchTeamDetail(demoMode, team).then((d) => setSingles(Boolean(d?.is_singles)));
  }, [demoMode, team]);

  useEffect(() => {
    fetchMyTeams(demoMode).then(setTeams);
  }, [demoMode]);

  // Only your teams of the same kind can play: your singles team against a
  // singles team, a doubles team against a doubles team.
  const playable = singles === null || teams === null ? null : teams.filter((t) => Boolean(t.is_singles) === singles);

  useEffect(() => {
    if (playable && playable.length === 1) setMyTeam(playable[0].team_id);
  }, [playable]);

  const players = useTeamPlayers(demoMode, [{ team_id: team }, ...(playable ?? [])]);
  const myChosen = (playable ?? []).find((t) => t.team_id === myTeam);

  const when = hour === null ? null : new Date(new Date(days[day].date).setHours(hour));
  const inPast = when !== null && when.getTime() < Date.now();
  const ready = myTeam && courtId && when && !inPast;

  const send = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      await sendChallenge(demoMode, myTeam, team, courtId, when, bestOf);
      Alert.alert('Challenge sent', `${teamName || 'They'} can accept or decline. You'll see it under Challenges.`);
      router.back();
    } catch (e) {
      Alert.alert("Couldn't send it", e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (playable && playable.length === 0) {
    return (
      <Screen>
        <Card style={{ padding: 16, gap: 10 }}>
          <Heading>{singles ? "SINGLES ISN'T READY YET" : 'YOU NEED A PARTNER FIRST'}</Heading>
          <Body tone="muted">
            {singles
              ? 'Your singles team shows up once the latest Sickle update finishes loading. Close the app and open it again.'
              : 'That team plays doubles, 2 vs 2. Make a team with a partner, then come back.'}
          </Body>
          {singles ? null : (
            <Link href="/team/new" asChild>
              <Button label="Find a partner" />
            </Link>
          )}
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Heading size={22}>CHALLENGE {(teamName || 'this team').toUpperCase()}</Heading>
      <Body tone="muted">
        {singles ? 'Singles, 1 vs 1. ' : ''}Ranked. It counts once {singles ? 'you both' : 'both teams'} agree on the score.
      </Body>

      <Card style={{ padding: 14, gap: 10 }}>
        <Body size={12} weight="bold" tone="muted">
          WHO PLAYS WHO
        </Body>
        <View style={{ gap: 2 }}>
          <Body size={12} tone="accent" weight="bold">
            {singles ? 'YOU' : 'YOUR TEAM'}
          </Body>
          <Body weight="semibold">{singles ? 'You' : myChosen ? `${myChosen.team_name}${players[myChosen.team_id] ? ` · ${players[myChosen.team_id]}` : ''}` : 'Pick your team below'}</Body>
        </View>
        <View style={{ gap: 2 }}>
          <Body size={12} tone="danger" weight="bold">
            {singles ? 'THEM' : 'THEIR TEAM'}
          </Body>
          <Body weight="semibold">{`${teamName || 'This team'}${players[team] && !singles ? ` · ${players[team]}` : ''}`}</Body>
        </View>
      </Card>

      <View style={{ gap: 8 }}>
        <Body weight="semibold">Match length</Body>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {([1, 3] as BestOf[]).map((n) => (
            <Chip key={n} label={matchLengthLabel(n)} selected={bestOf === n} onPress={() => setBestOf(n)} />
          ))}
        </View>
        <Body size={13} tone="muted">
          {bestOf === 1 ? 'One game to 11, win by 2. Quick, and the winner is whoever takes that game.' : 'First team to win 2 games, each to 11 and win by 2.'}
        </Body>
      </View>

      {singles ? null : (
        <View style={{ gap: 8 }}>
          <Body weight="semibold">Which of your teams is playing?</Body>
          {(playable ?? []).map((t) => (
            <TeamPick
              key={t.team_id}
              name={t.team_name}
              players={players[t.team_id]}
              selected={myTeam === t.team_id}
              onPress={() => setMyTeam(t.team_id)}
            />
          ))}
        </View>
      )}

      <View style={{ gap: 8 }}>
        <Body weight="semibold">Court</Body>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {sorted.map((c) => (
            <Chip
              key={c.id}
              label={c.miles !== null ? `${c.name} · ${formatMiles(Math.round(c.miles * 10) / 10)}` : c.name}
              selected={courtId === c.id}
              onPress={() => setCourtId(c.id)}
            />
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {!moreCourts && allSorted.length > sorted.length ? (
            <Button label="Show more courts" variant="ghost" size="sm" onPress={() => setMoreCourts(true)} />
          ) : null}
          <Link href="/court/new" asChild>
            <Button label="Court not listed? Add it" variant="ghost" size="sm" />
          </Link>
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

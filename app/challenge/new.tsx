import { Link, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { TeamPick } from '@/components/TeamPick';
import { nextHalfHour, TimeWheel } from '@/components/TimeWheel';
import { VsLine } from '@/components/VsLine';
import { Body, Button, Card, Chip, Heading, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { courtsNear, nearbyMiles, useCourts } from '@/lib/courts';
import { formatMiles } from '@/lib/format';
import { getLocationIfAllowed, LatLng } from '@/lib/location';
import { useProfile } from '@/lib/profile';
import { fetchMyTeams, fetchTeamDetail, sendChallenge, TeamRow, useTeamPlayers } from '@/lib/matches';
import { fetchPreferredTimesFor, hasPreferred, nextWindows, preferredText, PreferredTimes } from '@/lib/preferred';
import { BestOf, matchLengthLabel } from '@/lib/scores';

// "Wed, Oct 7 at 7:05 PM"
const whenText = (d: Date) =>
  `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;

// Challenge a team: pick which of your teams plays, where, and when.
export default function NewChallengeScreen() {
  const { team, teamName, court, myTeam: myTeamParam, bestOf: bestOfParam } = useLocalSearchParams<{ team: string; teamName?: string; court?: string; myTeam?: string; bestOf?: string }>();
  const { demoMode } = useAuth();
  const { profile } = useProfile();
  const { courts } = useCourts();
  const [teams, setTeams] = useState<TeamRow[] | null>(null);
  const [myTeam, setMyTeam] = useState<string | null>(myTeamParam ?? null);
  // Singles teams only play singles teams, doubles only doubles.
  const [singles, setSingles] = useState<boolean | null>(null);
  const [courtId, setCourtId] = useState<string | null>(court ?? null);
  const [when, setWhen] = useState(nextHalfHour);
  // When the players on the other team like to play.
  const [theirPrefs, setTheirPrefs] = useState<{ name: string; prefs: PreferredTimes }[]>([]);
  const [bestOf, setBestOf] = useState<BestOf>(bestOfParam === '1' ? 1 : 3);
  const [busy, setBusy] = useState(false);
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
    fetchTeamDetail(demoMode, team).then(async (d) => {
      setSingles(Boolean(d?.is_singles));
      const others = (d?.members ?? []).filter((m) => m.id !== profile?.id);
      const found = await fetchPreferredTimesFor(demoMode, others.map((m) => m.id));
      setTheirPrefs(others.map((m) => ({ name: m.name.split(' ')[0], prefs: found[m.id] })).filter((x) => hasPreferred(x.prefs)));
    });
  }, [demoMode, team, profile?.id]);

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

  const inPast = when.getTime() < Date.now();
  const ready = myTeam && courtId && !inPast;

  const send = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      await sendChallenge(demoMode, myTeam, team, courtId, when, bestOf);
      Alert.alert('Challenge sent', `${teamName || 'They'} can accept or decline. Track it under Challenges.`);
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
          <Heading>{singles ? "SINGLES ISN'T READY" : 'YOU NEED A TEAM'}</Heading>
          <Body tone="muted">
            {singles ? 'Your singles team is still loading. Close and reopen the app.' : 'Doubles needs a team. Make one with a friend, then come back.'}
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
      <Body tone="muted">Ranked. Counts once both sides confirm the score.</Body>

      <Card style={{ padding: 14 }}>
        <VsLine you={singles ? 'You' : (myChosen?.team_name ?? 'Your team')} them={teamName || 'This team'} size={22} />
      </Card>

      <View style={{ gap: 8 }}>
        <Body weight="semibold">Match length</Body>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {([1, 3] as BestOf[]).map((n) => (
            <Chip key={n} label={matchLengthLabel(n)} selected={bestOf === n} onPress={() => setBestOf(n)} />
          ))}
        </View>
        <Body size={13} tone="muted">
          {bestOf === 1 ? 'One game to 11, win by 2.' : 'First to win 2 games. Each game to 11, win by 2.'}
        </Body>
      </View>

      {singles ? null : (
        <View style={{ gap: 8 }}>
          <Body weight="semibold">Your team</Body>
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
        <Body weight="semibold">When</Body>
        {theirPrefs.map((x) => (
          <View key={x.name} style={{ gap: 6 }}>
            <Body size={13} tone="muted">
              {x.name} likes {preferredText(x.prefs)}
            </Body>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {nextWindows(x.prefs).map((d) => (
                <Chip key={d.getTime()} label={whenText(d)} selected={Math.abs(when.getTime() - d.getTime()) < 60_000} onPress={() => setWhen(d)} />
              ))}
            </View>
          </View>
        ))}
        <Card style={{ paddingVertical: 8, paddingHorizontal: 10, gap: 4 }}>
          <Body weight="bold" tone="accent" style={{ textAlign: 'center' }}>
            {whenText(when)}
          </Body>
          <TimeWheel value={when} onChange={setWhen} />
        </Card>
      </View>

      <Button label={busy ? 'Sending…' : 'Send challenge'} size="lg" disabled={busy || !ready} onPress={send} />
    </Screen>
  );
}

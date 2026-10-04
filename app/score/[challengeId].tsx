import { Link, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { DraftScores, ScoreEntry, toGameScores } from '@/components/ScoreEntry';
import { Body, Button, Card, Chip, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { Court, courtsNear, useCourts } from '@/lib/courts';
import { formatMiles } from '@/lib/format';
import { getLocationIfAllowed, LatLng } from '@/lib/location';
import { bestOfOf, formatWhen, submitScore, useChallenges } from '@/lib/matches';
import { checkMatch, matchLengthLabel } from '@/lib/scores';

// Enter the score for an accepted challenge. It goes to the other team to
// confirm (submit_match_result in supabase/migrations).
export default function EnterScoreScreen() {
  const { challengeId } = useLocalSearchParams<{ challengeId: string }>();
  const { demoMode } = useAuth();
  const rows = useChallenges(demoMode);
  const challenge = rows?.find((c) => c.challenge_id === challengeId);
  const bestOf = challenge ? bestOfOf(challenge) : 3;
  // Room for three games; a one game match only shows the first.
  const [draft, setDraft] = useState<DraftScores>([
    ['', ''],
    ['', ''],
    ['', ''],
  ]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Where it was played. Starts as the planned court; change it if you played somewhere else.
  const [courtId, setCourtId] = useState<string | null>(null);
  const { courts } = useCourts();
  const [here, setHere] = useState<LatLng | null>(null);
  useEffect(() => {
    getLocationIfAllowed().then(setHere);
  }, []);

  if (!rows) return <Screen>{null}</Screen>;
  if (!challenge || challenge.status !== 'accepted' || challenge.match_id) {
    return (
      <Screen>
        <Body tone="muted">This match doesn&apos;t need a score right now.</Body>
      </Screen>
    );
  }

  // The planned court plus the closest few others.
  const playedAt: (Court & { miles: number | null })[] = (() => {
    const sorted = courtsNear(here, courts ?? []);
    const planned = sorted.find((c) => c.id === challenge.court_id);
    const others = sorted.filter((c) => c.id !== challenge.court_id).slice(0, 7);
    return planned ? [planned, ...others] : others;
  })();

  const submit = async () => {
    const games = toGameScores(draft.slice(0, bestOf));
    const check = checkMatch(games, bestOf);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const picked = (courts ?? []).find((c) => c.id === courtId);
      await submitScore(demoMode, challenge, games, courtId ?? undefined, picked?.name);
      Alert.alert('Score sent', `${challenge.their_team_name} will be asked to confirm it.`);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card style={{ padding: 14 }}>
        <Body size={14} tone="subtle">
          {challenge.my_team_name} vs {challenge.their_team_name} at {challenge.court_name}, {formatWhen(challenge.proposed_time)}.{' '}
          {matchLengthLabel(bestOf)}. Games go to 11, win by 2. It counts once the other team confirms.
        </Body>
      </Card>
      <ScoreEntry
        teamA={challenge.my_team_name}
        teamB={challenge.their_team_name}
        value={draft.slice(0, bestOf)}
        onChange={(next) => setDraft([...next, ...draft.slice(next.length)])}
      />
      <View style={{ gap: 8 }}>
        <Body weight="semibold">Where did you play?</Body>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {playedAt.map((c) => (
            <Chip
              key={c.id}
              label={c.id === challenge.court_id ? `${c.name} (planned)` : c.miles !== null ? `${c.name} · ${formatMiles(Math.round(c.miles * 10) / 10)}` : c.name}
              selected={(courtId ?? challenge.court_id) === c.id}
              onPress={() => setCourtId(c.id)}
            />
          ))}
        </View>
        <Body size={13} tone="muted">
          Played somewhere else than planned? Pick that court. The other team sees it when they confirm.{' '}
          <Link href="/court/new">
            <Body size={13} tone="accent" weight="semibold">
              Court not listed? Add it.
            </Body>
          </Link>
        </Body>
      </View>
      {error ? (
        <Body tone="danger" weight="semibold">
          {error}
        </Body>
      ) : null}
      <View style={{ gap: 10 }}>
        <Button label={busy ? 'Sending…' : 'Send score'} size="lg" disabled={busy} onPress={submit} />
      </View>
    </Screen>
  );
}

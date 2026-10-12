import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { PersonPicker, usePeopleOptions } from '@/components/PersonPicker';
import { DraftScores, ScoreEntry, toGameScores } from '@/components/ScoreEntry';
import { TimeField, whenText } from '@/components/TimeWheel';
import { Body, Button, Card, Chip, Screen, Segmented } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { courtsNear, useCourts } from '@/lib/courts';
import { formatMiles } from '@/lib/format';
import { getLocationIfAllowed, LatLng } from '@/lib/location';
import { logGame } from '@/lib/matches';
import { useProfile } from '@/lib/profile';
import { BestOf, checkMatch, matchLengthLabel } from '@/lib/scores';

const emptyDraft = (): DraftScores => [
  ['', ''],
  ['', ''],
  ['', ''],
];

// Log a game that already happened, with no challenge. Players who aren't on
// the app can be added by name. If everyone on the other side was added by
// name it counts right away; otherwise the real players on that side confirm it.
export default function LogGameScreen() {
  const { demoMode } = useAuth();
  const { profile } = useProfile();
  const { courts } = useCourts();
  const { options, reload } = usePeopleOptions();
  const [kind, setKind] = useState<'singles' | 'doubles'>('singles');
  const [bestOf, setBestOf] = useState<BestOf>(3);
  const [partner, setPartner] = useState<string | null>(null);
  const [opp1, setOpp1] = useState<string | null>(null);
  const [opp2, setOpp2] = useState<string | null>(null);
  const [courtId, setCourtId] = useState<string | null>(null);
  const [when, setWhen] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - 30);
    return d;
  });
  const [draft, setDraft] = useState<DraftScores>(emptyDraft());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [here, setHere] = useState<LatLng | null>(null);

  useEffect(() => {
    getLocationIfAllowed().then(setHere);
  }, []);

  const nearby = courtsNear(here, courts ?? []).slice(0, 8);
  useEffect(() => {
    if (!courtId && nearby.length > 0) setCourtId(nearby[0].id);
    // nearby is rebuilt every render; where you are decides it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courtId, here, courts]);

  const doubles = kind === 'doubles';
  const names = new Map((options ?? []).map((o) => [o.id, o.name]));
  const first = (id: string | null) => (id ? (names.get(id) ?? 'Them').split(' ')[0] : null);
  const myName = (profile?.display_name ?? 'You').split(' ')[0];
  const teamA = doubles ? `${myName} + ${first(partner) ?? '?'}` : myName;
  const teamB = doubles ? `${first(opp1) ?? '?'} + ${first(opp2) ?? '?'}` : (first(opp1) ?? 'Opponent');

  const submit = async () => {
    const games = toGameScores(draft.slice(0, bestOf));
    if (!opp1 || (doubles && (!partner || !opp2))) return setError(doubles ? 'Pick your partner and both opponents.' : 'Pick who you played.');
    if (!courtId) return setError('Pick the court.');
    const check = checkMatch(games, bestOf);
    if (!check.ok) return setError(check.error);
    setError(null);
    setBusy(true);
    try {
      await logGame(demoMode, { court: courtId, playedAt: when, bestOf, games, partner: doubles ? partner : null, opponent1: opp1, opponent2: doubles ? opp2 : null });
      Alert.alert('Game logged', 'If a real player was on the other side, they will be asked to confirm it.');
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
          Log a game you already played. Someone not on the app? Add them by name. If you later see them on the app, link their name to their account.
        </Body>
      </Card>

      <View style={{ gap: 6 }}>
        <Body size={13} weight="semibold" tone="muted">
          What kind of game?
        </Body>
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'singles', label: 'Singles 1v1' },
            { value: 'doubles', label: 'Doubles 2v2' },
          ]}
        />
      </View>
      <View style={{ gap: 6 }}>
        <Body size={13} weight="semibold" tone="muted">
          How long?
        </Body>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([1, 3] as BestOf[]).map((n) => (
            <Chip key={n} label={matchLengthLabel(n)} selected={bestOf === n} onPress={() => setBestOf(n)} />
          ))}
        </View>
      </View>

      {doubles ? <PersonPicker label="Your partner" value={partner} onChange={setPartner} options={options} onCreated={reload} exclude={[opp1, opp2]} /> : null}
      <PersonPicker label={doubles ? 'First opponent' : 'Who you played'} value={opp1} onChange={setOpp1} options={options} onCreated={reload} exclude={[partner, opp2]} />
      {doubles ? <PersonPicker label="Second opponent" value={opp2} onChange={setOpp2} options={options} onCreated={reload} exclude={[partner, opp1]} /> : null}

      <ScoreEntry teamA={teamA} teamB={teamB} value={draft.slice(0, bestOf)} onChange={(next) => setDraft([...next, ...draft.slice(next.length)])} />

      <View style={{ gap: 8 }}>
        <Body weight="semibold">Where did you play?</Body>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {nearby.map((c) => (
            <Chip
              key={c.id}
              label={c.miles !== null ? `${c.name} · ${formatMiles(Math.round(c.miles * 10) / 10)}` : c.name}
              selected={courtId === c.id}
              onPress={() => setCourtId(c.id)}
            />
          ))}
        </View>
        <Link href="/court/new" asChild>
          <Button label="Court not listed? Add it" variant="ghost" size="sm" style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
        </Link>
      </View>

      <View style={{ gap: 8 }}>
        <Body weight="semibold">When did you play?</Body>
        <TimeField title="When it happened" value={when} display={whenText(when)} onChange={setWhen} allowPast maxDays={1} daysBack={60} />
      </View>

      {error ? (
        <Body tone="danger" weight="semibold">
          {error}
        </Body>
      ) : null}
      <Button label={busy ? 'Saving…' : 'Log game'} size="lg" disabled={busy} onPress={submit} />
      <Link href="/people" asChild>
        <Button label="Manage people I added" variant="ghost" />
      </Link>
    </Screen>
  );
}

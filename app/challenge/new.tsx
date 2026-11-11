import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { CourtPicker } from '@/components/CourtPicker';
import { PersonPicker, usePeopleOptions } from '@/components/PersonPicker';
import { nextHalfHour, TimeField, whenText } from '@/components/TimeWheel';
import { Body, Button, Card, Chip, Heading, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { createGameChallenge, editChallenge, fetchTeamDetail, useChallenges } from '@/lib/matches';
import { useProfile } from '@/lib/profile';
import { BestOf, matchLengthLabel } from '@/lib/scores';
import { useTheme } from '@/lib/theme';

type Kind = 'singles' | 'doubles';
// A spot is a picked player, "I don't know yet", or not decided.
type Spot = { id: string; name: string } | 'unknown' | null;

// The challenge builder. Singles or doubles first, then who plays, then where
// and when. Anyone on Sickle can be picked, and any spot can be left for later.
// With ?edit=<id> it changes a challenge you already sent.
export default function NewChallengeScreen() {
  const { edit, opponent, opponentName, team, court } = useLocalSearchParams<{
    edit?: string;
    opponent?: string;
    opponentName?: string;
    team?: string;
    court?: string;
  }>();
  const { demoMode } = useAuth();
  const { profile } = useProfile();
  const { colors } = useTheme();
  const { options, reload } = usePeopleOptions();
  const rows = useChallenges(demoMode);
  const editing = edit ? (rows ?? []).find((r) => r.challenge_id === edit) : undefined;

  const [kind, setKind] = useState<Kind | null>(null);
  const [partner, setPartner] = useState<Spot>(null);
  const [opp1, setOpp1] = useState<Spot>(opponent ? { id: opponent, name: opponentName || 'Player' } : null);
  const [opp2, setOpp2] = useState<Spot>(null);
  const [courtId, setCourtId] = useState<string | null>(court ?? null);
  const [when, setWhen] = useState(nextHalfHour);
  const [bestOf, setBestOf] = useState<BestOf>(3);
  const [busy, setBusy] = useState(false);
  const filled = useRef(false);

  // Coming from a team page: that team is who you are challenging.
  useEffect(() => {
    if (!team || edit) return;
    fetchTeamDetail(demoMode, team).then((d) => {
      if (!d) return;
      const others = d.members.filter((m) => m.id !== profile?.id).map((m) => ({ id: m.id, name: m.name }));
      setKind(d.is_singles ? 'singles' : 'doubles');
      setOpp1(others[0] ?? null);
      setOpp2(d.is_singles ? null : (others[1] ?? null));
    });
  }, [demoMode, team, edit, profile?.id]);

  // Editing: start from what was sent.
  useEffect(() => {
    if (!editing || filled.current) return;
    filled.current = true;
    const players = editing.players ?? [];
    const doubles = (editing.my_team_name + editing.their_team_name).includes(' + ') || players.length > 2;
    const mine = players.filter((p) => p.mine && !p.creator);
    const theirs = players.filter((p) => !p.mine);
    const spot = (p?: { id: string; name: string }): Spot => (p ? { id: p.id, name: p.name } : 'unknown');
    setKind(doubles ? 'doubles' : 'singles');
    setPartner(doubles ? spot(mine[0]) : null);
    setOpp1(spot(theirs[0]));
    setOpp2(doubles ? (theirs[0] ? spot(theirs[1]) : null) : null);
    setCourtId(editing.court_id);
    setWhen(new Date(editing.proposed_time));
    setBestOf(editing.best_of === 1 ? 1 : 3);
  }, [editing]);

  const doubles = kind === 'doubles';
  const ids = (...s: Spot[]) => s.map((x) => (x && x !== 'unknown' ? x.id : null));
  const pickerFor = (label: string, spot: Spot, set: (s: Spot) => void, others: Spot[], opts: { allowAdd?: boolean } = {}) => {
    const value = spot && spot !== 'unknown' ? spot.id : null;
    return (
      <PersonPicker
        label={label}
        value={value}
        unknown={spot === 'unknown'}
        allowUnknown
        allowAdd={opts.allowAdd}
        options={options}
        onCreated={reload}
        exclude={[...ids(...others), profile?.id ?? null]}
        onChange={(id, name) => set(id ? { id, name: name ?? 'Player' } : null)}
        onUnknown={() => set('unknown')}
      />
    );
  };

  const opp1Chosen = opp1 !== null;
  const opp2Needed = doubles && opp1 !== null && opp1 !== 'unknown';
  const playersDone = kind !== null && opp1Chosen && (!doubles || (partner !== null && (!opp2Needed || opp2 !== null)));
  const inPast = when.getTime() < Date.now();
  const ready = playersDone && Boolean(courtId) && !inPast;

  const send = async () => {
    if (!ready || !kind || !courtId) return;
    setBusy(true);
    try {
      const [p, o1, o2] = ids(partner, opp1, opp2);
      const draft = { kind, partner: p, opponent1: o1, opponent2: opp2Needed ? o2 : null, court: courtId, when, bestOf };
      if (editing) {
        await editChallenge(demoMode, editing.challenge_id, draft);
        Alert.alert('Challenge updated', 'Everyone who needs to is asked again.');
      } else {
        await createGameChallenge(demoMode, draft);
        Alert.alert('Challenge sent', 'Everyone you picked gets it and says if they are in. Track it under Challenges.');
      }
      router.back();
    } catch (e) {
      Alert.alert(editing ? "Couldn't update it" : "Couldn't send it", e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const big = (label: string, sub: string, value: Kind) => {
    const on = kind === value;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        onPress={() => setKind(value)}
        style={{
          flex: 1,
          paddingVertical: 18,
          borderRadius: 14,
          borderWidth: 2,
          borderColor: on ? colors.inverse : colors.borderStrong,
          backgroundColor: on ? colors.inverse : colors.surface,
          alignItems: 'center',
          gap: 2,
        }}>
        <Heading size={20} style={{ color: on ? colors.surface : colors.text }}>
          {label}
        </Heading>
        <Body size={12} style={{ color: on ? colors.surface : colors.textMuted }}>
          {sub}
        </Body>
      </Pressable>
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: editing ? 'Edit challenge' : 'Challenge a player' }} />
      {edit && !editing ? (
        <Card style={{ padding: 16 }}>
          <Body tone="muted">Loading your challenge…</Body>
        </Card>
      ) : (
        <>
          <View style={{ gap: 8 }}>
            <Heading size={18}>WHAT ARE YOU PLAYING?</Heading>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {big('SINGLES', '1 vs 1', 'singles')}
              {big('DOUBLES', '2 vs 2', 'doubles')}
            </View>
          </View>

          {kind ? (
            <View style={{ gap: 12 }}>
              <Heading size={18}>WHO'S PLAYING?</Heading>
              {doubles ? pickerFor('Your partner', partner, setPartner, [opp1, opp2]) : null}
              {pickerFor(doubles ? 'First opponent' : 'Your opponent', opp1, (s) => { setOpp1(s); if (s === 'unknown' || s === null) setOpp2(null); }, [partner, opp2], { allowAdd: false })}
              {doubles ? (
                opp2Needed ? (
                  pickerFor('Second opponent', opp2, setOpp2, [partner, opp1], { allowAdd: false })
                ) : (
                  <Body size={13} tone="muted">
                    Pick your first opponent to choose the second.
                  </Body>
                )
              ) : null}
              <Body size={13} tone="muted">
                Anyone on Sickle works, friends or not. Not sure yet? Pick "I don't know yet" and fill it in later with Edit.
              </Body>
            </View>
          ) : null}

          {playersDone ? (
            <>
              <View style={{ gap: 8 }}>
                <Body weight="semibold">Match length</Body>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {([1, 3] as BestOf[]).map((n) => (
                    <Chip key={n} label={matchLengthLabel(n)} selected={bestOf === n} onPress={() => setBestOf(n)} />
                  ))}
                </View>
              </View>

              <CourtPicker value={courtId} onChange={setCourtId} />

              <View style={{ gap: 8 }}>
                <Body weight="semibold">When</Body>
                <TimeField title="Pick a time" value={when} display={whenText(when)} onChange={setWhen} />
              </View>

              {editing ? (
                <Card style={{ padding: 12 }}>
                  <Body size={13} tone="muted">
                    Swapping a player only asks the new player. A new time, court or length asks everyone again.
                  </Body>
                </Card>
              ) : null}
              <Button label={busy ? 'Sending…' : editing ? 'Save changes' : 'Send challenge'} size="lg" disabled={busy || !ready} onPress={send} />
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}

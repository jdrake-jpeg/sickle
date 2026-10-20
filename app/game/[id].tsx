import { Link, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { DraftScores, fromGameScores, ScoreEntry, toGameScores } from '@/components/ScoreEntry';
import { TimeField, whenText } from '@/components/TimeWheel';
import { Body, Button, Card, Chip, Heading, Screen } from '@/components/ui';
import { fonts } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { courtsNear, useCourts } from '@/lib/courts';
import { getLocationIfAllowed, LatLng } from '@/lib/location';
import { cancelMatchChange, DetailTeam, fetchMatchDetail, formatWhen, MatchDetail, proposeMatchChange, respondToMatchChange } from '@/lib/matches';
import { checkMatch, formatScores, matchLengthLabel } from '@/lib/scores';
import { useTheme } from '@/lib/theme';

const statusLine = (d: MatchDetail) => {
  switch (d.status) {
    case 'confirmed':
      return 'Confirmed. This counts toward records.';
    case 'awaiting_confirmation':
      return 'Waiting on confirmation, so it does not count yet.';
    case 'needs_admin':
      return 'An admin is deciding the score.';
    case 'unconfirmed':
      return "Nobody confirmed it in 72 hours, so it doesn't count.";
    default:
      return '';
  }
};

// One played game: when, the scores, who played and where. Anyone who played
// can ask to change the score or delete it. If a real player is on the other
// side they have to agree first.
export default function GameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { demoMode } = useAuth();
  const { courts } = useCourts();
  const [detail, setDetail] = useState<MatchDetail | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftScores>([]);
  const [courtId, setCourtId] = useState<string | null>(null);
  const [when, setWhen] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [here, setHere] = useState<LatLng | null>(null);

  const load = useCallback(() => fetchMatchDetail(demoMode, id).then(setDetail), [demoMode, id]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useEffect(() => {
    getLocationIfAllowed().then(setHere);
  }, []);

  if (detail === undefined) return <Screen>{null}</Screen>;
  if (detail === null) {
    return (
      <Screen>
        <Body tone="muted">This game isn&apos;t available. It may have been deleted, or its players keep their record private.</Body>
      </Screen>
    );
  }

  const d = detail;
  const mine = d.my_side;
  const winsA = d.games.filter(([a, b]) => a > b).length;
  const winsB = d.games.length - winsA;
  const canChange = mine !== null && (d.status === 'confirmed' || d.status === 'unconfirmed');
  const canDelete = mine !== null && d.status !== 'needs_admin';
  const pending = d.pending_change;

  const startEdit = () => {
    setDraft(fromGameScores(d.games, d.best_of));
    setCourtId(d.court_id);
    setWhen(new Date(d.played_at));
    setError(null);
    setEditing(true);
  };

  const done = async (r: 'applied' | 'pending', other: string) => {
    await load();
    setEditing(false);
    Alert.alert(r === 'applied' ? 'Done' : 'Sent for confirmation', r === 'applied' ? 'The game was updated.' : `${other} will be asked to agree. Nothing changes until they do.`);
  };
  const otherName = mine === 'a' ? d.team_b.name : d.team_a.name;

  const saveEdit = async () => {
    const games = toGameScores(draft.slice(0, d.best_of));
    const check = checkMatch(games, d.best_of);
    if (!check.ok) return setError(check.error);
    setError(null);
    setBusy(true);
    try {
      const r = await proposeMatchChange(demoMode, d.match_id, 'edit', {
        games,
        court: courtId && courtId !== d.court_id ? courtId : undefined,
        playedAt: Math.abs(when.getTime() - new Date(d.played_at).getTime()) > 30_000 ? when : undefined,
      });
      await done(r, otherName);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const askDelete = () =>
    Alert.alert('Delete this game?', d.logged ? 'It stops counting toward records and leaderboards. The others in the game are told.' : 'It stops counting toward records and leaderboards. The other team has to agree.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const r = await proposeMatchChange(demoMode, d.match_id, 'delete');
            if (r === 'applied') {
              Alert.alert('Deleted', 'The game is gone.');
              router.back();
            } else {
              await done(r, otherName);
            }
          } catch (e) {
            Alert.alert("Couldn't do that", e instanceof Error ? e.message : 'Try again.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);

  const answer = async (accept: boolean) => {
    if (!pending) return;
    setBusy(true);
    try {
      await respondToMatchChange(demoMode, pending.id, accept);
      if (accept && pending.kind === 'delete') {
        router.back();
        return;
      }
      await load();
    } catch (e) {
      Alert.alert("Couldn't do that", e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await cancelMatchChange(demoMode, pending.id);
      await load();
    } catch (e) {
      Alert.alert("Couldn't do that", e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    const near = courtsNear(here, courts ?? []).slice(0, 7);
    const current = (courts ?? []).find((c) => c.id === d.court_id);
    const list = current && !near.some((c) => c.id === current.id) ? [{ ...current, miles: null as number | null }, ...near] : near;
    return (
      <Screen>
        <Card style={{ padding: 14 }}>
          <Body size={14} tone="subtle">
            {d.logged ? 'Fix the score, court or time. It changes right away and the others in the game are told.' : `Fix the score, court or time. ${otherName} has to agree before it changes.`}
          </Body>
        </Card>
        <ScoreEntry teamA={d.team_a.name} teamB={d.team_b.name} value={draft.slice(0, d.best_of)} onChange={(next) => setDraft([...next, ...draft.slice(next.length)])} />
        <View style={{ gap: 8 }}>
          <Body weight="semibold">Court</Body>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {list.map((c) => (
              <Chip key={c.id} label={c.name} selected={courtId === c.id} onPress={() => setCourtId(c.id)} />
            ))}
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <Body weight="semibold">When it was played</Body>
          <TimeField title="When it happened" value={when} display={whenText(when)} onChange={setWhen} allowPast maxDays={1} daysBack={365} />
        </View>
        {error ? (
          <Body tone="danger" weight="semibold">
            {error}
          </Body>
        ) : null}
        <Button label={busy ? 'Saving…' : 'Save changes'} size="lg" disabled={busy} onPress={saveEdit} />
        <Button label="Back" variant="ghost" onPress={() => setEditing(false)} />
      </Screen>
    );
  }

  const aWon = d.winner === 'a';
  return (
    <Screen>
      {pending ? (
        <Card style={{ padding: 14, gap: 10 }} highlighted>
          <Heading size={15}>{pending.by_side === mine ? 'YOU ASKED FOR A CHANGE' : `${pending.by_name.toUpperCase()} ASKED FOR A CHANGE`}</Heading>
          <Body size={14} tone="subtle">
            {pending.kind === 'delete'
              ? 'Delete this game.'
              : [
                  pending.games ? `New score ${formatScores(pending.games)}` : null,
                  pending.court_name ? `at ${pending.court_name}` : null,
                  pending.played_at ? `on ${formatWhen(pending.played_at)}` : null,
                ]
                  .filter(Boolean)
                  .join(' ')}
          </Body>
          {pending.by_side === mine ? (
            <Button label="Take it back" variant="outline" disabled={busy} onPress={withdraw} />
          ) : mine ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button label="Agree" style={{ flex: 1 }} disabled={busy} onPress={() => answer(true)} />
              <Button label="Don't agree" variant="outline" style={{ flex: 1 }} disabled={busy} onPress={() => answer(false)} />
            </View>
          ) : null}
        </Card>
      ) : null}

      <Card style={{ padding: 16, gap: 16, borderRadius: 20 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Body size={13} tone="muted">
            {matchLengthLabel(d.best_of)}
            {d.logged ? ' · Logged after playing' : ''}
          </Body>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
          <TeamBlock team={d.team_a} won={aWon} align="left" />
          <Heading size={40} style={{ fontFamily: fonts.display, marginTop: -4 }}>
            {winsA}–{winsB}
          </Heading>
          <TeamBlock team={d.team_b} won={!aWon} align="right" />
        </View>
        <View style={{ borderTopWidth: 1, borderColor: colors.border }}>
          {d.games.map(([a, b], i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: i < d.games.length - 1 ? 1 : 0, borderColor: colors.border }}>
              <Body size={13} tone="muted" style={{ flex: 1 }}>
                Game {i + 1}
              </Body>
              <Body style={{ fontFamily: fonts.numeric, fontSize: 22 }}>
                <Body style={{ fontFamily: fonts.numeric, fontSize: 22 }} tone={a > b ? 'accent' : 'default'}>
                  {a}
                </Body>
                {' – '}
                <Body style={{ fontFamily: fonts.numeric, fontSize: 22 }} tone={b > a ? 'accent' : 'default'}>
                  {b}
                </Body>
              </Body>
              <View style={{ flex: 1 }} />
            </View>
          ))}
        </View>
      </Card>

      <Card style={{ padding: 16, gap: 12 }}>
        <Row label="Played" value={formatWhen(d.played_at)} />
        {!d.logged ? <Row label="Scheduled for" value={formatWhen(d.scheduled_for)} /> : null}
        <View style={{ gap: 2 }}>
          <Body size={12} tone="muted">
            Where
          </Body>
          <Link href={{ pathname: '/court/[id]', params: { id: d.court_id } }} asChild>
            <Pressable accessibilityRole="link" style={{ alignSelf: 'flex-start' }}>
              <Body weight="semibold" tone="accent">
                {d.court_name}
              </Body>
            </Pressable>
          </Link>
        </View>
        {d.submitted_by_name ? <Row label="Score entered by" value={d.submitted_by_name} /> : null}
        {statusLine(d) ? (
          <Body size={13} tone="subtle">
            {statusLine(d)}
          </Body>
        ) : null}
      </Card>

      {mine && d.status === 'awaiting_confirmation' ? (
        <Link href={{ pathname: '/match/[id]', params: { id: d.challenge_id } }} asChild>
          <Button label={d.awaiting_side === mine ? 'Review and confirm the score' : 'See where it stands'} size="lg" />
        </Link>
      ) : null}

      {mine && !pending ? (
        <View style={{ gap: 10 }}>
          {canChange ? <Button label="Edit the score" variant="outline" disabled={busy} onPress={startEdit} /> : null}
          {canDelete ? <Button label="Delete this game" variant="dangerOutline" disabled={busy} onPress={askDelete} /> : null}
        </View>
      ) : null}
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Body size={12} tone="muted">
        {label}
      </Body>
      <Body weight="semibold">{value}</Body>
    </View>
  );
}

// One side of the score: each player on their own line, lined up, green when you can tap through to them.
function TeamBlock({ team, won, align }: { team: DetailTeam; won: boolean; align: 'left' | 'right' }) {
  const { colors } = useTheme();
  const right = align === 'right';
  return (
    <View style={{ flex: 1, gap: 6, alignItems: right ? 'flex-end' : 'flex-start' }}>
      {team.players.map((p) =>
        p.placeholder ? (
          <Body key={p.id} weight="bold" size={15} numberOfLines={1} style={{ textAlign: align }}>
            {p.name}
          </Body>
        ) : (
          <Link key={p.id} href={{ pathname: '/player/[id]', params: { id: p.id } }} asChild>
            <Pressable accessibilityRole="link">
              <Body weight="bold" size={15} numberOfLines={1} style={{ color: colors.accentText, textAlign: align }}>
                {p.name}
              </Body>
            </Pressable>
          </Link>
        ),
      )}
      {won ? <WinTag /> : null}
    </View>
  );
}

function WinTag() {
  const { colors } = useTheme();
  return (
    <View style={{ alignSelf: 'flex-start', height: 22, paddingHorizontal: 8, borderRadius: 6, backgroundColor: colors.accentFill, justifyContent: 'center' }}>
      <Body size={12} weight="bold" tone="onAccent">
        WIN
      </Body>
    </View>
  );
}

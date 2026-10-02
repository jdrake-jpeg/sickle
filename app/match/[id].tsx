import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { RatePlayers } from '@/components/RatePlayers';
import { DraftScores, fromGameScores, ScoreEntry, toGameScores } from '@/components/ScoreEntry';
import { Body, Button, Card, Field, Heading, Screen } from '@/components/ui';
import { fonts } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { confirmResult, disputeResult, formatWhen, matchStatusText, timeAgo, useChallenges } from '@/lib/matches';
import { checkBestOfThree, GameScore } from '@/lib/scores';
import { useTheme } from '@/lib/theme';

// One match, opened by its challenge id. If the score is waiting on you,
// confirm it or dispute it by entering the score you think is right. The
// database enforces who can do this and how many rounds a dispute gets
// (confirm_match_result and dispute_match_result in supabase/migrations).
// Once it's confirmed, you can privately rate the other players.
export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { demoMode } = useAuth();
  const rows = useChallenges(demoMode);
  const row = rows?.find((c) => c.challenge_id === id);
  const [disputing, setDisputing] = useState(false);
  const [draft, setDraft] = useState<DraftScores | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!rows) return <Screen>{null}</Screen>;
  if (!row || !row.match_id || !row.games) {
    return (
      <Screen>
        <Body tone="muted">No score has been entered for this match yet.</Body>
      </Screen>
    );
  }

  const games: GameScore[] = row.games;
  const r = { teamA: row.my_team_name, teamB: row.their_team_name, games };
  const winsA = games.filter(([a, b]) => a > b).length;
  const winsB = games.length - winsA;
  const aWon = winsA > winsB;
  const canAnswer = row.match_status === 'awaiting_confirmation' && row.awaiting_me;
  const title = canAnswer ? 'Confirm score' : 'Match';

  const confirm = async () => {
    setBusy(true);
    try {
      await confirmResult(demoMode, row);
      Alert.alert('Score confirmed', 'Records and the court leaderboard are updated. Now you can rate how the others played.');
    } catch (e) {
      Alert.alert("Couldn't confirm", e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const sendCorrection = async () => {
    const next = toGameScores(draft ?? fromGameScores(games));
    const check = checkBestOfThree(next);
    if (!check.ok) return setError(check.error);
    if (JSON.stringify(next) === JSON.stringify(games)) return setError('That is the same score. Confirm it instead.');
    setError(null);
    setBusy(true);
    try {
      const status = await disputeResult(demoMode, row, next, note);
      Alert.alert(
        status === 'needs_admin' ? 'Sent to an admin' : 'Correction sent',
        status === 'needs_admin'
          ? "You two still don't agree, so an admin will decide the score."
          : `${row.their_team_name} will be asked to accept your score. It won't count until both teams agree.`,
      );
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (disputing) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Fix the score' }} />
        <Card style={{ padding: 14 }}>
          <Body size={14} tone="subtle">
            Enter the score you think is right. {r.teamB} can accept it or send one more correction. If you still don&apos;t agree, an admin decides.
          </Body>
        </Card>
        <ScoreEntry teamA={r.teamA} teamB={r.teamB} value={draft ?? fromGameScores(games)} onChange={setDraft} />
        <Field label="Note (optional)" placeholder="We won game 3 11–8" value={note} onChangeText={setNote} maxLength={500} />
        {error ? (
          <Body tone="danger" weight="semibold">
            {error}
          </Body>
        ) : null}
        <View style={{ gap: 10 }}>
          <Button label={busy ? 'Sending…' : 'Send correction'} size="lg" disabled={busy} onPress={sendCorrection} />
          <Link href="/rules" asChild>
            <Button label="Check the rules" variant="outline" />
          </Link>
          <Button label="Back" variant="ghost" onPress={() => setDisputing(false)} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title }} />
      <Card style={{ padding: 14 }}>
        <Body size={14} tone="subtle">
          {canAnswer
            ? `${row.submitted_by_name ?? 'The other team'} entered this score ${timeAgo(row.played_at ?? row.created_at)}. It only counts once your team agrees.`
            : matchStatusText(row) + '.'}
        </Body>
      </Card>

      <Card style={{ padding: 16, gap: 16, borderRadius: 20 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Body size={13} tone="muted">
            {row.court_name}
          </Body>
          <Body size={13} tone="muted">
            {formatWhen(row.played_at ?? row.proposed_time)}
          </Body>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Heading size={18}>{r.teamA}</Heading>
            {aWon ? <WinTag /> : null}
          </View>
          <Heading size={44} style={{ fontFamily: fonts.display }}>
            {winsA}–{winsB}
          </Heading>
          <View style={{ flex: 1, gap: 4, alignItems: 'flex-end' }}>
            <Heading size={18}>{r.teamB}</Heading>
            {!aWon ? <WinTag /> : null}
          </View>
        </View>
        <View style={{ borderTopWidth: 1, borderColor: colors.border }}>
          {r.games.map(([a, b], i) => (
            <View
              key={i}
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: i < r.games.length - 1 ? 1 : 0, borderColor: colors.border }}>
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
              <Body size={13} tone="muted" style={{ flex: 1, textAlign: 'right' }}>
                {a > b ? r.teamA : r.teamB}
              </Body>
            </View>
          ))}
        </View>
      </Card>

      {canAnswer ? (
        <View style={{ gap: 10 }}>
          <Button label={busy ? 'Saving…' : 'Confirm score'} size="lg" disabled={busy} onPress={confirm} />
          <Button label="That's not right" variant="dangerOutline" disabled={busy} onPress={() => setDisputing(true)} />
        </View>
      ) : null}

      {row.match_status === 'confirmed' ? <RatePlayers demoMode={demoMode} matchId={row.match_id} /> : null}
    </Screen>
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

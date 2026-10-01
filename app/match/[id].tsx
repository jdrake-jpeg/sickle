import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { DraftScores, fromGameScores, ScoreEntry, toGameScores } from '@/components/ScoreEntry';
import { Body, Button, Card, Field, Heading, Screen } from '@/components/ui';
import { fonts } from '@/constants/theme';
import { pendingResult } from '@/lib/sample-data';
import { checkBestOfThree } from '@/lib/scores';
import { useTheme } from '@/lib/theme';

// Confirm a score the other team entered, or dispute it by entering the score
// you think is right. The database enforces who can do this and how many
// rounds a dispute gets (confirm_match_result and dispute_match_result in
// supabase/migrations).
export default function ConfirmResultScreen() {
  const { colors } = useTheme();
  const r = pendingResult;
  const [disputing, setDisputing] = useState(false);
  const [draft, setDraft] = useState<DraftScores>(fromGameScores(r.games));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const winsA = r.games.filter(([a, b]) => a > b).length;
  const winsB = r.games.length - winsA;
  const aWon = winsA > winsB;

  const confirm = () => {
    Alert.alert('Result confirmed', 'Records and the court leaderboard are updated.');
    router.back();
  };

  const sendCorrection = () => {
    const games = toGameScores(draft);
    const check = checkBestOfThree(games);
    if (!check.ok) return setError(check.error);
    if (JSON.stringify(games) === JSON.stringify(r.games)) return setError('That is the same score. Confirm it instead.');
    setError(null);
    Alert.alert('Correction sent', `${r.teamA} will be asked to accept your score. It won't count until both teams agree.`);
    router.back();
  };

  if (disputing) {
    return (
      <Screen>
        <Card style={{ padding: 14 }}>
          <Body size={14} tone="subtle">
            Enter the score you think is right. {r.teamA} can accept it or send one more correction. If you still don&apos;t agree, an admin decides.
          </Body>
        </Card>
        <ScoreEntry teamA={r.teamA} teamB={r.teamB} value={draft} onChange={setDraft} />
        <Field label="Note (optional)" placeholder="We won game 3 11–8" value={note} onChangeText={setNote} maxLength={500} />
        {error ? (
          <Body tone="danger" weight="semibold">
            {error}
          </Body>
        ) : null}
        <View style={{ gap: 10 }}>
          <Button label="Send correction" size="lg" onPress={sendCorrection} />
          <Button label="Back" variant="ghost" onPress={() => setDisputing(false)} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card style={{ padding: 14 }}>
        <Body size={14} tone="subtle">
          {r.submittedBy} entered this score {r.submittedAgo}. It only counts once your team agrees.
        </Body>
      </Card>

      <Card style={{ padding: 16, gap: 16, borderRadius: 20 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Body size={13} tone="muted">
            {r.court}
          </Body>
          <Body size={13} tone="muted">
            {r.when}
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

      <View style={{ gap: 10 }}>
        <Button label="Confirm score" size="lg" onPress={confirm} />
        <Button label="That's not right" variant="dangerOutline" onPress={() => setDisputing(true)} />
      </View>
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

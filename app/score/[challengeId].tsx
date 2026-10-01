import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { DraftScores, ScoreEntry, toGameScores } from '@/components/ScoreEntry';
import { Body, Button, Card, Screen } from '@/components/ui';
import { challenges } from '@/lib/sample-data';
import { checkBestOfThree } from '@/lib/scores';

// Enter the score for an accepted challenge. It goes to the other team to
// confirm (submit_match_result in supabase/migrations).
export default function EnterScoreScreen() {
  const { challengeId } = useLocalSearchParams<{ challengeId: string }>();
  const challenge = challenges.accepted.find((c) => c.id === challengeId) ?? challenges.accepted[0];
  const [draft, setDraft] = useState<DraftScores>([
    ['', ''],
    ['', ''],
    ['', ''],
  ]);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const check = checkBestOfThree(toGameScores(draft));
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError(null);
    Alert.alert('Score sent', `${challenge.them} will be asked to confirm it.`);
    router.back();
  };

  return (
    <Screen>
      <Card style={{ padding: 14 }}>
        <Body size={14} tone="subtle">
          {challenge.us} vs {challenge.them} at {challenge.court}. Games go to 11, win by 2. It counts once the other team confirms.
        </Body>
      </Card>
      <ScoreEntry teamA={challenge.us} teamB={challenge.them} value={draft} onChange={setDraft} />
      {error ? (
        <Body tone="danger" weight="semibold">
          {error}
        </Body>
      ) : null}
      <View style={{ gap: 10 }}>
        <Button label="Send score" size="lg" onPress={submit} />
      </View>
    </Screen>
  );
}

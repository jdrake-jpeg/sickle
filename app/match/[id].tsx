import { router } from 'expo-router';
import { Alert, View } from 'react-native';

import { Body, Button, Card, Heading, Screen } from '@/components/ui';
import { fonts } from '@/constants/theme';
import { pendingResult } from '@/lib/sample-data';
import { useTheme } from '@/lib/theme';

// Confirm or dispute a result the OTHER team submitted. The database enforces
// that only a player on the non-submitting team can do this
// (see respond_to_match_result in supabase/migrations).
export default function ConfirmResultScreen() {
  const { colors } = useTheme();
  const r = pendingResult;
  const winsA = r.games.filter(([a, b]) => a > b).length;
  const winsB = r.games.length - winsA;
  const aWon = winsA > winsB;

  const confirm = () => {
    Alert.alert('Result confirmed', 'Records and the leaderboard are updated.');
    router.back();
  };
  const dispute = () => {
    Alert.alert('Score disputed', 'This match will not count until it is sorted out.');
    router.back();
  };

  return (
    <Screen>
      <Card style={{ padding: 14 }}>
        <Body size={14} tone="subtle">
          {r.submittedBy} submitted this score {r.submittedAgo}. It only counts toward rankings once your team confirms it.
        </Body>
      </Card>

      <Card style={{ padding: 16, gap: 16, borderRadius: 20 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Body size={13} tone="muted">
            {r.court} · Ranked
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
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 12,
                borderBottomWidth: i < r.games.length - 1 ? 1 : 0,
                borderColor: colors.border,
              }}>
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
        <Button label="Confirm result" size="lg" onPress={confirm} />
        <Button label="Dispute score" variant="dangerOutline" onPress={dispute} />
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

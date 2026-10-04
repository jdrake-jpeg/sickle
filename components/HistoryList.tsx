import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Body, Card } from '@/components/ui';
import { formatWhen, HistoryRow } from '@/lib/matches';
import { formatScores } from '@/lib/scores';
import { useTheme } from '@/lib/theme';

// Confirmed matches: won or lost, the score, who they played against and
// where. Tap the court to open it. In a player's history it also says who they
// teamed up with.
export function HistoryList({ rows, empty }: { rows: HistoryRow[] | null; empty: string }) {
  const { colors } = useTheme();
  if (rows === null) return <Body tone="muted">Loading…</Body>;
  if (rows.length === 0) {
    return (
      <Card style={{ padding: 16 }}>
        <Body tone="muted">{empty}</Body>
      </Card>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      {rows.map((r) => (
        <Card key={r.challenge_id} style={{ padding: 14, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: r.won ? colors.accentFill : colors.danger,
              }}>
              <Body weight="bold" size={13} style={{ color: r.won ? colors.onAccent : colors.onDanger }}>
                {r.won ? 'W' : 'L'}
              </Body>
            </View>
            <View style={{ flex: 1 }}>
              <Body weight="semibold">vs {r.opponent_name}</Body>
            </View>
            <Body size={13} tone="subtle">
              {formatScores(r.games ?? [])}
            </Body>
          </View>
          <Body size={13} tone="muted">
            {r.is_singles ? 'Singles · ' : r.with_name ? `With ${r.with_name} · ` : ''}
            {formatWhen(r.played_at)}
          </Body>
          <Link href={{ pathname: '/court/[id]', params: { id: r.court_id } }} asChild>
            <Pressable accessibilityRole="link" style={{ alignSelf: 'flex-start' }}>
              <Body size={13} weight="semibold" tone="accent">
                {r.court_name}
              </Body>
            </Pressable>
          </Link>
        </Card>
      ))}
    </View>
  );
}

import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { RecordFilters } from '@/components/RecordFilters';
import { ShowMore, usePaged } from '@/components/ShowMore';
import { Body, Card } from '@/components/ui';
import { formatWhen, HistoryRow } from '@/lib/matches';
import { applyRecordFilter, noRecordFilter, RecordFilter } from '@/lib/record';
import { formatScores } from '@/lib/scores';
import { useTheme } from '@/lib/theme';

// Confirmed matches: won or lost, the score, who they played against and
// where. Tap a match for the full details, or the court to open it. In a player's history it also says who they
// teamed up with. Filter by singles or doubles and by same or different teams.
export function HistoryList({ rows, empty }: { rows: HistoryRow[] | null; empty: string }) {
  const { colors } = useTheme();
  const [filter, setFilter] = useState<RecordFilter>(noRecordFilter);
  const shownRows = applyRecordFilter(
    (rows ?? []).map((r) => ({ row: r, singles: Boolean(r.is_singles), opponent: r.opponent_id })),
    filter,
  ).map((x) => x.row);
  // The last three games, then See more opens all the rest at once.
  const paged = usePaged(shownRows, 3, 100000);
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
      {rows.length > 1 ? <RecordFilters filter={filter} onChange={setFilter} /> : null}
      {shownRows.length === 0 ? (
        <Card style={{ padding: 16 }}>
          <Body tone="muted">No matches fit these filters.</Body>
        </Card>
      ) : null}
      {paged.shown.map((r) => (
        <Link key={r.challenge_id} href={{ pathname: '/game/[id]', params: { id: r.challenge_id } }} asChild>
          <Pressable accessibilityRole="link">
        <Card style={{ padding: 14, gap: 6 }}>
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
              <Body weight="semibold" numberOfLines={2}>
                vs {r.opponent_name}
              </Body>
            </View>
            <Body size={13} tone="subtle" style={{ minWidth: 64, textAlign: 'right' }}>
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
          <Body size={12} tone="subtle">
            Tap for details
          </Body>
        </Card>
          </Pressable>
        </Link>
      ))}
      <ShowMore hasMore={paged.hasMore} remaining={paged.remaining} onPress={paged.more} />
    </View>
  );
}

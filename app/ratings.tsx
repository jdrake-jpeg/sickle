import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { Body, Card, Heading, Screen, Segmented, Stat } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fetchMyRatings, fetchRatingSummary, RatingRow, RatingSummary, timeAgo } from '@/lib/matches';

// The private ratings other players gave you after matches, and the ones you
// gave. Nobody else can see these.
export default function RatingsScreen() {
  const { demoMode } = useAuth();
  const [summary, setSummary] = useState<RatingSummary | null>(null);
  const [rows, setRows] = useState<RatingRow[]>([]);
  const [tab, setTab] = useState<'received' | 'given'>('received');

  useFocusEffect(
    useCallback(() => {
      fetchRatingSummary(demoMode).then(setSummary);
      fetchMyRatings(demoMode).then(setRows);
    }, [demoMode]),
  );

  const shown = rows.filter((r) => r.received === (tab === 'received'));

  return (
    <Screen>
      <Body tone="muted">Only you see these. After a match, players can say what level they think you really played at.</Body>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Stat value={summary?.average != null ? Number(summary.average).toFixed(1) : '–'} label="Average" tone="accent" />
        <Stat value={String(summary?.ratings ?? 0)} label="Ratings" />
        <Stat value={String(summary?.last_30_days ?? 0)} label="Last 30 days" />
      </View>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'received', label: 'For you' },
          { value: 'given', label: 'You gave' },
        ]}
      />
      {shown.length === 0 ? (
        <Card style={{ padding: 16 }}>
          <Body tone="muted">
            {tab === 'received' ? 'No ratings yet. Play a ranked match and they show up here.' : "You haven't rated anyone yet. Open a confirmed match to rate the others."}
          </Body>
        </Card>
      ) : null}
      {shown.map((r) => (
        <Card key={r.id} style={{ padding: 14, gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Body weight="semibold">{r.received ? `From ${r.other_name}` : `To ${r.other_name}`}</Body>
            <Heading size={20}>{Number(r.skill).toFixed(1)}</Heading>
          </View>
          {r.note ? <Body>&ldquo;{r.note}&rdquo;</Body> : null}
          <Body size={12} tone="muted">
            {timeAgo(r.created_at)}
          </Body>
        </Card>
      ))}
    </Screen>
  );
}

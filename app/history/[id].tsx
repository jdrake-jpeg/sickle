import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { HistoryList } from '@/components/HistoryList';
import { Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fetchPlayerHistory, HistoryRow } from '@/lib/matches';

// A player's whole match history, opened by tapping their record. Tap a game
// to see when it was played, the scores, who played, and where.
export default function HistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { demoMode } = useAuth();
  const [rows, setRows] = useState<HistoryRow[] | null>(null);

  useEffect(() => {
    fetchPlayerHistory(demoMode, id).then(setRows);
  }, [demoMode, id]);

  return (
    <Screen>
      <HistoryList rows={rows} empty="No confirmed matches yet." />
    </Screen>
  );
}

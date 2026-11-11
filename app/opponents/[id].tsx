import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable } from 'react-native';

import { Avatar, Body, Card, ListRow, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { initialsOf } from '@/lib/format';
import { fetchPlayerOpponents, OpponentRow, timeAgo } from '@/lib/matches';

// Everyone a player has played against, with their record against each one.
// Tap someone to see their page. Hidden if the player keeps their record private.
export default function OpponentsScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { demoMode } = useAuth();
  const [rows, setRows] = useState<OpponentRow[] | null>(null);
  const first = (name ?? 'They').split(' ')[0];

  useEffect(() => {
    fetchPlayerOpponents(demoMode, id).then(setRows);
  }, [demoMode, id]);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Opponents' }} />
      {rows === null ? <Body tone="muted">Loading…</Body> : null}
      {rows && rows.length === 0 ? (
        <Card style={{ padding: 16 }}>
          <Body tone="muted">{first} hasn&apos;t played anyone yet, or keeps their record private.</Body>
        </Card>
      ) : null}
      {(rows ?? []).map((o) => {
        const row = (
          <ListRow
            left={<Avatar initials={initialsOf(o.display_name)} size={40} uri={o.avatar_url} />}
            title={o.display_name}
            subtitle={`${o.wins}–${o.losses} · last played ${timeAgo(o.last_played)}`}
          />
        );
        return o.placeholder ? (
          <Pressable key={o.profile_id} disabled>
            {row}
          </Pressable>
        ) : (
          <Link key={o.profile_id} href={{ pathname: '/player/[id]', params: { id: o.profile_id } }} asChild>
            <Pressable accessibilityRole="link">{row}</Pressable>
          </Link>
        );
      })}
    </Screen>
  );
}

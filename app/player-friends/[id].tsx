import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable } from 'react-native';

import { Avatar, Body, Card, ListRow, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { initialsOf } from '@/lib/format';
import { fetchPlayerFriends, FriendOfPlayer } from '@/lib/matches';

// A player's friends. The ones you are also friends with come first.
export default function PlayerFriendsScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { demoMode } = useAuth();
  const [rows, setRows] = useState<FriendOfPlayer[] | null>(null);
  const first = (name ?? 'They').split(' ')[0];

  useEffect(() => {
    fetchPlayerFriends(demoMode, id).then(setRows);
  }, [demoMode, id]);

  const sorted = [...(rows ?? [])].sort((a, b) => Number(b.mutual) - Number(a.mutual) || a.display_name.localeCompare(b.display_name));

  return (
    <Screen>
      <Stack.Screen options={{ title: `${first}'s friends` }} />
      {rows === null ? <Body tone="muted">Loading…</Body> : null}
      {rows && rows.length === 0 ? (
        <Card style={{ padding: 16 }}>
          <Body tone="muted">{first} doesn&apos;t have any friends on Sickle yet.</Body>
        </Card>
      ) : null}
      {sorted.map((f) => (
        <Link key={f.profile_id} href={{ pathname: '/player/[id]', params: { id: f.profile_id } }} asChild>
          <Pressable accessibilityRole="link">
            <ListRow
              left={<Avatar initials={initialsOf(f.display_name)} size={40} uri={f.avatar_url} />}
              title={f.display_name}
              subtitle={[`@${f.username}`, f.mutual ? 'Friends with you too' : null].filter(Boolean).join(' · ')}
            />
          </Pressable>
        </Link>
      ))}
    </Screen>
  );
}

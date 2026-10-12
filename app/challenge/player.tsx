import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ChallengeBuilder } from '@/components/ChallengeBuilder';
import { Body, Button, Card, Chip, Heading, SearchField, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fetchFriends } from '@/lib/friends';
import { supabase } from '@/lib/supabase';

type Person = { id: string; name: string; username?: string };

// Challenge a player without opening their profile first: pick a friend or
// search, then choose singles or doubles, how long, and the court and time.
export default function ChallengePlayerScreen() {
  const { demoMode } = useAuth();
  const [friends, setFriends] = useState<Person[]>([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  const [picked, setPicked] = useState<Person | null>(null);

  useEffect(() => {
    fetchFriends(demoMode).then((f) => setFriends(f.filter((x) => x.relation === 'friend').map((x) => ({ id: x.id, name: x.name, username: x.username }))));
  }, [demoMode]);

  const query = q.trim();
  useEffect(() => {
    if (query.length < 2 || demoMode || !supabase) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase!.rpc('search_players', { p_query: query });
      setResults(((data ?? []) as { profile_id: string; display_name: string; username: string }[]).map((p) => ({ id: p.profile_id, name: p.display_name, username: p.username })));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, demoMode]);

  if (picked) {
    return (
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Heading size={20}>{picked.name.toUpperCase()}</Heading>
          <Button label="Change" variant="outline" size="sm" onPress={() => setPicked(null)} />
        </View>
        <ChallengeBuilder playerId={picked.id} firstName={picked.name.split(' ')[0]} blocked={false} />
      </Screen>
    );
  }

  const shown = query.length >= 2 ? results : friends;
  return (
    <Screen>
      <SearchField label="Find a player" placeholder="Name or username" value={q} onChangeText={setQ} />
      <Body weight="semibold">{query.length >= 2 ? 'Results' : 'Your friends'}</Body>
      {shown.length === 0 ? (
        <Card style={{ padding: 16 }}>
          <Body tone="muted">{query.length >= 2 ? 'Nobody found.' : 'No friends yet. Search for a player above.'}</Body>
        </Card>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {shown.map((p) => (
          <Chip key={p.id} label={p.username ? `${p.name} · @${p.username}` : p.name} onPress={() => setPicked(p)} />
        ))}
      </View>
    </Screen>
  );
}

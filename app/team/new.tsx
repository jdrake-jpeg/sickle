import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { Avatar, Body, Button, Card, Chip, Field, Heading, ListRow, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { initialsOf } from '@/lib/format';
import { fetchFriends, FriendRow } from '@/lib/friends';
import { nearbyPlayers } from '@/lib/sample-data';
import { supabase } from '@/lib/supabase';

type Person = { id: string; name: string; username: string };

// Make a two-person team: pick a partner (a friend, or search anyone), name
// it if you want, done. Teams are what challenge other teams.
export default function NewTeamScreen() {
  const { demoMode } = useAuth();
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  const [partner, setPartner] = useState<Person | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchFriends(demoMode).then((f) => setFriends(f.filter((x) => x.relation === 'friend')));
  }, [demoMode]);

  const q = query.trim();
  useEffect(() => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    if (demoMode || !supabase) {
      setResults(nearbyPlayers.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) || p.username.includes(q.toLowerCase())));
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase!.rpc('search_players', { p_query: q });
      setResults(
        ((data ?? []) as { profile_id: string; display_name: string; username: string }[]).map((p) => ({
          id: p.profile_id,
          name: p.display_name,
          username: p.username,
        })),
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [q, demoMode]);

  const create = async () => {
    if (!partner) return;
    const teamName = name.trim() || `You + ${partner.name.split(' ')[0]}`;
    if (!demoMode && supabase) {
      setBusy(true);
      const { error } = await supabase.rpc('create_team', { p_partner: partner.id, p_name: name.trim() || null });
      setBusy(false);
      if (error) {
        Alert.alert("Couldn't make the team", error.message);
        return;
      }
    }
    Alert.alert('Team made', `${teamName} is ready. Challenge a team from a court leaderboard or a player's page.`);
    router.back();
  };

  return (
    <Screen>
      <Body tone="muted">Teams are two players. Pick your partner.</Body>

      {partner ? (
        <Card style={{ padding: 16, gap: 12 }} highlighted>
          <ListRow left={<Avatar initials={initialsOf(partner.name)} size={40} />} title={partner.name} subtitle={`@${partner.username}`} />
          <Field label="Team name (optional)" placeholder={`You + ${partner.name.split(' ')[0]}`} value={name} onChangeText={setName} maxLength={40} />
          <Button label={busy ? 'Making it…' : 'Make the team'} size="lg" disabled={busy} onPress={create} />
          <Button label="Pick someone else" variant="ghost" onPress={() => setPartner(null)} />
        </Card>
      ) : (
        <>
          {friends.length > 0 ? (
            <View style={{ gap: 8 }}>
              <Heading size={14}>YOUR FRIENDS</Heading>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {friends.map((f) => (
                  <Chip key={f.id} label={f.name} onPress={() => setPartner({ id: f.id, name: f.name, username: f.username })} />
                ))}
              </View>
            </View>
          ) : null}
          <Field label="Search any player" placeholder="Name or username" autoCapitalize="none" autoCorrect={false} value={query} onChangeText={setQuery} />
          {results.map((p) => (
            <ListRow
              key={p.id}
              left={<Avatar initials={initialsOf(p.name)} size={40} />}
              title={p.name}
              subtitle={`@${p.username}`}
              right={<Button label="Pick" size="sm" onPress={() => setPartner(p)} />}
            />
          ))}
          {q.length >= 2 && results.length === 0 ? (
            <Card style={{ padding: 16 }}>
              <Body tone="muted">
                Nobody matches &ldquo;{q}&rdquo;. Your partner needs a Sickle account first. Testing alone? Make a second account in your
                Mac&apos;s web browser.
              </Body>
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}

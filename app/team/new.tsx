import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { Avatar, Body, Button, Card, Field, Heading, ListRow, Screen, SearchField } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { initialsOf } from '@/lib/format';
import { fetchFriends, FriendRow } from '@/lib/friends';
import { fetchMyTeams } from '@/lib/matches';
import { supabase } from '@/lib/supabase';

type Person = { id: string; name: string; username: string };

// Make a two-person team with a friend. Friends only, so nobody gets put on a
// team by a stranger.
export default function NewTeamScreen() {
  const { demoMode } = useAuth();
  const { partner: partnerParam } = useLocalSearchParams<{ partner?: string }>();
  const [friends, setFriends] = useState<FriendRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [partner, setPartner] = useState<Person | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  // Friends you already have a team with. One team per pair.
  const [taken, setTaken] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchFriends(demoMode).then((f) => {
      const accepted = f.filter((x) => x.relation === 'friend');
      setFriends(accepted);
      const preset = partnerParam ? accepted.find((x) => x.id === partnerParam) : null;
      if (preset) setPartner({ id: preset.id, name: preset.name, username: preset.username });
    });
  }, [demoMode, partnerParam]);

  useEffect(() => {
    fetchMyTeams(demoMode).then((t) => setTaken(new Set(t.filter((x) => !x.is_singles && x.partner_id).map((x) => x.partner_id as string))));
  }, [demoMode]);

  const q = query.trim().toLowerCase();
  const shown = (friends ?? []).filter((f) => !q || f.name.toLowerCase().includes(q) || f.username.toLowerCase().includes(q));

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
    Alert.alert('Team made', `${teamName} is ready. Pick it when you challenge another team.`);
    router.back();
  };

  return (
    <Screen>
      <Body tone="muted">A team is you and one friend. Pick who you want to play doubles with.</Body>
      {partner ? (
        <Card style={{ padding: 16, gap: 12 }} highlighted>
          <ListRow left={<Avatar initials={initialsOf(partner.name)} size={40} />} title={partner.name} subtitle={`@${partner.username}`} />
          <Field label="Team name (optional)" placeholder={`You + ${partner.name.split(' ')[0]}`} value={name} onChangeText={setName} maxLength={40} />
          <Button label={busy ? 'Making it…' : 'Make the team'} size="lg" disabled={busy} onPress={create} />
          <Button label="Pick someone else" variant="ghost" onPress={() => setPartner(null)} />
        </Card>
      ) : friends === null ? null : friends.length === 0 ? (
        <Card style={{ padding: 16, gap: 10 }}>
          <Heading>ADD A FRIEND FIRST</Heading>
          <Body tone="muted">You don&apos;t have any friends on Sickle yet. Find a player and send a friend request. Once they accept you can team up.</Body>
          <Button label="Find friends" onPress={() => router.replace('/friends')} />
        </Card>
      ) : (
        <View style={{ gap: 8 }}>
          <Heading size={14}>YOUR FRIENDS</Heading>
          {friends.length > 5 ? <SearchField label="Search your friends" placeholder="Name or username" value={query} onChangeText={setQuery} /> : null}
          {shown.map((f) => (
            <ListRow
              key={f.id}
              left={<Avatar initials={initialsOf(f.name)} size={40} />}
              title={f.name}
              subtitle={`@${f.username}`}
              right={
                taken.has(f.id) ? (
                  <Body size={13} tone="muted">
                    Already a team
                  </Body>
                ) : (
                  <Button label="Pick" size="sm" onPress={() => setPartner({ id: f.id, name: f.name, username: f.username })} />
                )
              }
            />
          ))}
          {shown.length === 0 ? <Body tone="muted">No friend matches that.</Body> : null}
        </View>
      )}
    </Screen>
  );
}

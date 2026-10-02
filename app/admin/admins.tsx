import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { Avatar, Body, Button, Card, Field, ListRow, Screen, SectionHeader } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { initialsOf } from '@/lib/format';
import { useProfile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

type Person = { id: string; username: string; display_name: string; is_admin: boolean };

const demoPeople: Person[] = [
  { id: 'demo', username: 'drake', display_name: 'Drake', is_admin: true },
  { id: 'p1', username: 'jackt', display_name: 'Jack Thompson', is_admin: false },
  { id: 'p2', username: 'abbyl', display_name: 'Abby Larsen', is_admin: false },
];

// Admins give or remove admin for other players. The database enforces who
// may do this; this screen only shows it to admins.
export default function ManageAdminsScreen() {
  const { demoMode } = useAuth();
  const { profile, refresh } = useProfile();
  const [admins, setAdmins] = useState<Person[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(demoPeople);

  const loadAdmins = useCallback(async () => {
    if (demoMode || !supabase) {
      setAdmins(demo.filter((p) => p.is_admin));
      return;
    }
    const { data } = await supabase.from('profiles').select('id, username, display_name, is_admin').eq('is_admin', true).order('username');
    setAdmins((data as Person[] | null) ?? []);
  }, [demoMode, demo]);

  useEffect(() => {
    loadAdmins();
  }, [loadAdmins]);

  const q = query.trim().toLowerCase().replace(/[%_]/g, '');
  useEffect(() => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    if (demoMode || !supabase) {
      setResults(demo.filter((p) => p.username.startsWith(q)));
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase!
        .from('profiles')
        .select('id, username, display_name, is_admin')
        .ilike('username', `${q}%`)
        .order('username')
        .limit(10);
      setResults((data as Person[] | null) ?? []);
    }, 300);
    return () => clearTimeout(timer);
  }, [q, demoMode, demo]);

  if (!profile?.is_admin) {
    return (
      <Screen>
        <Body tone="muted">Only admins can manage admins.</Body>
      </Screen>
    );
  }

  const change = async (person: Person, makeAdmin: boolean) => {
    if (demoMode || !supabase) {
      setDemo((list) => list.map((p) => (p.id === person.id ? { ...p, is_admin: makeAdmin } : p)));
      setResults((list) => list.map((p) => (p.id === person.id ? { ...p, is_admin: makeAdmin } : p)));
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('set_admin', { p_profile: person.id, p_admin: makeAdmin });
    setBusy(false);
    if (error) {
      Alert.alert("Couldn't change that", error.message);
      return;
    }
    setResults((list) => list.map((p) => (p.id === person.id ? { ...p, is_admin: makeAdmin } : p)));
    await loadAdmins();
    if (person.id === profile.id) await refresh();
  };

  const confirm = (person: Person, makeAdmin: boolean) => {
    const self = person.id === profile.id;
    Alert.alert(
      makeAdmin ? `Make @${person.username} an admin?` : self ? 'Remove your own admin access?' : `Remove @${person.username} as admin?`,
      makeAdmin
        ? 'Admins can approve courts and give or remove admin for anyone, including you.'
        : self
          ? "You'll lose the admin screens. Another admin would have to add you back."
          : 'They lose the admin screens right away.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: makeAdmin ? 'Make admin' : 'Remove', style: makeAdmin ? 'default' : 'destructive', onPress: () => change(person, makeAdmin) },
      ],
    );
  };

  const row = (person: Person) => (
    <ListRow
      key={person.id}
      left={<Avatar initials={initialsOf(person.display_name)} size={36} />}
      title={person.display_name + (person.id === profile.id ? ' (you)' : '')}
      subtitle={`@${person.username}`}
      right={
        <Button
          label={person.is_admin ? 'Remove' : 'Make admin'}
          variant={person.is_admin ? 'dangerOutline' : 'outline'}
          size="sm"
          disabled={busy}
          onPress={() => confirm(person, !person.is_admin)}
        />
      }
    />
  );

  return (
    <Screen>
      <View style={{ gap: 8 }}>
        <SectionHeader title="Admins" detail={`${admins.length}`} />
        {admins.map(row)}
        <Body size={13} tone="muted">
          There&apos;s always at least one admin, so the last one can&apos;t be removed.
        </Body>
      </View>

      <View style={{ gap: 8 }}>
        <SectionHeader title="Add an admin" />
        <Field label="Find a player" placeholder="Search by username" autoCapitalize="none" autoCorrect={false} value={query} onChangeText={setQuery} />
        {q.length >= 2 && results.length === 0 ? (
          <Card style={{ padding: 16 }}>
            <Body tone="muted">No player with a username starting &ldquo;{q}&rdquo;.</Body>
          </Card>
        ) : null}
        {results.map(row)}
      </View>
    </Screen>
  );
}

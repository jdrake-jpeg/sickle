import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { Body, Button, Chip, Field } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fetchFriends } from '@/lib/friends';
import { createPerson, fetchMyPeople } from '@/lib/matches';

export type PersonOption = { id: string; name: string; person: boolean };

// Friends plus the people you added by name. Anyone you put in a game has to
// be one of these.
export function usePeopleOptions() {
  const { demoMode } = useAuth();
  const [options, setOptions] = useState<PersonOption[] | null>(null);

  const reload = useCallback(async () => {
    const [friends, people] = await Promise.all([fetchFriends(demoMode), fetchMyPeople(demoMode)]);
    setOptions([
      ...friends.filter((f) => f.relation === 'friend').map((f) => ({ id: f.id, name: f.name, person: false })),
      ...people.map((p) => ({ id: p.profile_id, name: p.display_name, person: true })),
    ]);
  }, [demoMode]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { options, reload };
}

// Pick one person. "Add someone by name" makes a person on the spot, for
// someone who isn't on the app.
export function PersonPicker({
  label,
  value,
  onChange,
  options,
  onCreated,
  exclude = [],
}: {
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  options: PersonOption[] | null;
  onCreated: () => Promise<void>;
  exclude?: (string | null)[];
}) {
  const { demoMode } = useAuth();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const list = (options ?? []).filter((o) => o.id === value || !exclude.includes(o.id));

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const id = await createPerson(demoMode, name.trim());
      await onCreated();
      onChange(id);
      setName('');
      setAdding(false);
    } catch (e) {
      Alert.alert("Couldn't add them", e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      <Body weight="semibold">{label}</Body>
      {options === null ? <Body tone="muted">Loading…</Body> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {list.map((o) => (
          <Chip key={o.id} label={o.person ? `${o.name} (added by you)` : o.name} selected={value === o.id} onPress={() => onChange(value === o.id ? null : o.id)} />
        ))}
        <Chip label={adding ? 'Cancel' : '+ Add someone by name'} onPress={() => setAdding(!adding)} />
      </View>
      {options !== null && list.length === 0 && !adding ? (
        <Body size={13} tone="muted">
          Friends show up here. Someone who isn&apos;t on the app yet? Add them by name.
        </Body>
      ) : null}
      {adding ? (
        <View style={{ gap: 8 }}>
          <Field label="Their name" placeholder="Jordan Lee" value={name} onChangeText={setName} maxLength={40} autoCapitalize="words" />
          <Button label={busy ? 'Adding…' : 'Add and pick them'} disabled={busy || !name.trim()} onPress={add} />
        </View>
      ) : null}
    </View>
  );
}

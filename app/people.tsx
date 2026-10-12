import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Alert, View } from 'react-native';

import { Body, Button, Card, Chip, Field, Heading, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fetchFriends, FriendRow } from '@/lib/friends';
import { createPerson, deletePerson, fetchMyPeople, linkPerson, PersonRow, renamePerson } from '@/lib/matches';

// People you added by name because they aren't on the app. You can rename or
// remove them, and once they join (and you are friends) link their name to
// their account so their games move over.
export default function PeopleScreen() {
  const { demoMode } = useAuth();
  const [people, setPeople] = useState<PersonRow[] | null>(null);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [newName, setNewName] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [renaming, setRenaming] = useState('');
  const [linking, setLinking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setPeople(await fetchMyPeople(demoMode));
    setFriends((await fetchFriends(demoMode)).filter((f) => f.relation === 'friend'));
  }, [demoMode]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const run = async (action: () => Promise<unknown>, done?: () => void) => {
    setBusy(true);
    try {
      await action();
      await load();
      done?.();
    } catch (e) {
      Alert.alert("Couldn't do that", e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const link = (p: PersonRow, f: FriendRow) =>
    Alert.alert(`Link ${p.display_name} to ${f.name}?`, `Every game with ${p.display_name} moves onto ${f.name}'s account and shows in their history. This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Link them',
        onPress: () =>
          run(
            async () => {
              const n = await linkPerson(demoMode, p.profile_id, f.id);
              Alert.alert('Linked', `${n} game${n === 1 ? '' : 's'} moved to ${f.name}.`);
            },
            () => {
              setOpen(null);
              setLinking(null);
            },
          ),
      },
    ]);

  const remove = (p: PersonRow) =>
    Alert.alert(`Remove ${p.display_name}?`, 'Only works if no games were logged with them.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => run(() => deletePerson(demoMode, p.profile_id), () => setOpen(null)) },
    ]);

  return (
    <Screen>
      <Card style={{ padding: 14 }}>
        <Body size={14} tone="subtle">
          These are players you added by name. Only you can see them. When one joins Sickle and you are friends, link them so their games land on their real account.
        </Body>
      </Card>

      <View style={{ gap: 8 }}>
        <Field label="Add someone" placeholder="Jordan Lee" value={newName} onChangeText={setNewName} maxLength={40} autoCapitalize="words" />
        <Button
          label="Add"
          disabled={busy || !newName.trim()}
          onPress={() =>
            run(
              () => createPerson(demoMode, newName.trim()),
              () => setNewName(''),
            )
          }
        />
      </View>

      {people === null ? <Body tone="muted">Loading…</Body> : null}
      {people && people.length === 0 ? (
        <Card style={{ padding: 16 }}>
          <Body tone="muted">Nobody added yet.</Body>
        </Card>
      ) : null}
      {(people ?? []).map((p) => (
        <Card key={p.profile_id} style={{ padding: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Heading size={17}>{p.display_name}</Heading>
              <Body size={13} tone="muted">
                {p.wins}–{p.losses} in logged games
              </Body>
            </View>
            <Button
              label={open === p.profile_id ? 'Close' : 'Manage'}
              variant="outline"
              size="sm"
              onPress={() => {
                setOpen(open === p.profile_id ? null : p.profile_id);
                setRenaming(p.display_name);
                setLinking(null);
              }}
            />
          </View>
          {open === p.profile_id ? (
            <View style={{ gap: 10 }}>
              <Field label="Name" value={renaming} onChangeText={setRenaming} maxLength={40} autoCapitalize="words" />
              <Button label="Save name" variant="outline" disabled={busy || !renaming.trim() || renaming.trim() === p.display_name} onPress={() => run(() => renamePerson(demoMode, p.profile_id, renaming.trim()))} />
              <Button label={linking === p.profile_id ? 'Hide friends' : 'Link to a friend’s account'} variant="outline" onPress={() => setLinking(linking === p.profile_id ? null : p.profile_id)} />
              {linking === p.profile_id ? (
                <View style={{ gap: 8 }}>
                  <Body size={13} tone="muted">
                    Pick the friend this is. Add them as a friend first if they are not on this list.
                  </Body>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {friends.map((f) => (
                      <Chip key={f.id} label={f.name} onPress={() => link(p, f)} />
                    ))}
                  </View>
                  {friends.length === 0 ? <Body size={13} tone="muted">No friends yet.</Body> : null}
                </View>
              ) : null}
              <Button label="Remove" variant="dangerOutline" onPress={() => remove(p)} />
            </View>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}

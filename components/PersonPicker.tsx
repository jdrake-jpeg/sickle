import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { Body, Button, Field, SearchField } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fetchFriends } from '@/lib/friends';
import { createPerson, FoundPlayer, fetchMyPeople, fetchRecentPlayers, searchPlayers } from '@/lib/matches';
import { useTheme } from '@/lib/theme';

export type PersonOption = { id: string; name: string; person: boolean; group: 'recent' | 'friend' | 'added' };

// Players you have played with, your friends, and the people you added by name.
export function usePeopleOptions() {
  const { demoMode } = useAuth();
  const [options, setOptions] = useState<PersonOption[] | null>(null);

  const reload = useCallback(async () => {
    const [friends, people, recent] = await Promise.all([fetchFriends(demoMode), fetchMyPeople(demoMode), fetchRecentPlayers(demoMode)]);
    const out: PersonOption[] = recent.map((r) => ({ id: r.id, name: r.name, person: r.person, group: 'recent' as const }));
    const seen = new Set(out.map((o) => o.id));
    for (const f of friends.filter((x) => x.relation === 'friend')) {
      if (!seen.has(f.id)) {
        out.push({ id: f.id, name: f.name, person: false, group: 'friend' });
        seen.add(f.id);
      }
    }
    for (const p of people) {
      if (!seen.has(p.profile_id)) {
        out.push({ id: p.profile_id, name: p.display_name, person: true, group: 'added' });
        seen.add(p.profile_id);
      }
    }
    setOptions(out);
  }, [demoMode]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { options, reload };
}

// A small dropdown. Recent players and friends come first. Type to find anyone
// on the app. "Add by name" makes someone who isn't on the app yet.
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
  onChange: (id: string | null, name?: string) => void;
  options: PersonOption[] | null;
  onCreated: () => Promise<void>;
  exclude?: (string | null)[];
}) {
  const { demoMode } = useAuth();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<FoundPlayer[]>([]);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setFound([]);
      return;
    }
    const timer = setTimeout(() => searchPlayers(demoMode, q).then(setFound), 250);
    return () => clearTimeout(timer);
  }, [q, demoMode]);

  const list = (options ?? []).filter((o) => !exclude.includes(o.id) || o.id === value);
  const selectedName = value ? (list.find((o) => o.id === value)?.name ?? (picked?.id === value ? picked.name : null) ?? 'Picked') : null;

  const choose = (id: string, nm: string) => {
    setPicked({ id, name: nm });
    onChange(id, nm);
    setOpen(false);
    setQ('');
  };

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const id = await createPerson(demoMode, name.trim());
      await onCreated();
      choose(id, name.trim());
      setName('');
      setAdding(false);
    } catch (e) {
      Alert.alert("Couldn't add them", e instanceof Error ? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const row = (id: string, nm: string, note?: string) => (
    <Pressable key={id} accessibilityRole="button" onPress={() => choose(id, nm)} style={{ paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', gap: 8, alignItems: 'baseline' }}>
      <Body weight="semibold" style={{ color: colors.accentText }}>
        {nm}
      </Body>
      {note ? (
        <Body size={12} tone="muted">
          {note}
        </Body>
      ) : null}
    </Pressable>
  );

  const heading = (t: string) => (
    <Body key={t} size={11} weight="bold" tone="muted" style={{ paddingHorizontal: 12, paddingTop: 8 }}>
      {t}
    </Body>
  );

  const recent = list.filter((o) => o.group === 'recent').slice(0, 6);
  const friends = list.filter((o) => o.group === 'friend');
  const added = list.filter((o) => o.group === 'added');
  const searching = q.trim().length >= 2;

  return (
    <View style={{ gap: 6 }}>
      <Body size={13} weight="semibold" tone="muted">
        {label}
      </Body>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(!open)}
        style={{ height: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: open ? colors.inverse : colors.borderStrong, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Body weight={selectedName ? 'semibold' : 'regular'} tone={selectedName ? 'default' : 'muted'}>
          {selectedName ?? 'Pick someone'}
        </Body>
        <Body tone="muted">{open ? '▴' : '▾'}</Body>
      </Pressable>
      {open ? (
        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, padding: 8, gap: 6 }}>
          <SearchField label="Find someone" placeholder="Name or username" value={q} onChangeText={setQ} style={{ height: 40 }} />
          <ScrollView nestedScrollEnabled style={{ maxHeight: 240 }} keyboardShouldPersistTaps="handled">
            {searching ? (
              found.filter((p) => !exclude.includes(p.id)).length === 0 ? (
                <Body size={13} tone="muted" style={{ padding: 12 }}>
                  Nobody found.
                </Body>
              ) : (
                found.filter((p) => !exclude.includes(p.id)).map((p) => row(p.id, p.name, `@${p.username}`))
              )
            ) : (
              <>
                {recent.length ? heading('PLAYED WITH') : null}
                {recent.map((o) => row(o.id, o.name, o.person ? 'added by you' : undefined))}
                {friends.length ? heading('FRIENDS') : null}
                {friends.map((o) => row(o.id, o.name))}
                {added.length ? heading('ADDED BY YOU') : null}
                {added.map((o) => row(o.id, o.name))}
                {options !== null && list.length === 0 ? (
                  <Body size={13} tone="muted" style={{ padding: 12 }}>
                    Nobody yet. Search above or add someone.
                  </Body>
                ) : null}
              </>
            )}
          </ScrollView>
          {adding ? (
            <View style={{ gap: 6 }}>
              <Field label="Their name" placeholder="Jordan Lee" value={name} onChangeText={setName} maxLength={40} autoCapitalize="words" />
              <Button label={busy ? 'Adding…' : 'Add and pick'} size="sm" disabled={busy || !name.trim()} onPress={add} />
            </View>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setAdding(true)} style={{ paddingVertical: 8, paddingHorizontal: 12 }}>
              <Body weight="semibold" style={{ color: colors.accentText }}>
                + Add someone not on the app
              </Body>
            </Pressable>
          )}
          {value ? <Button label="Clear" variant="ghost" size="sm" onPress={() => { onChange(null); setOpen(false); }} /> : null}
        </View>
      ) : null}
    </View>
  );
}

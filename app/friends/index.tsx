import { Link, useFocusEffect } from 'expo-router';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { skillLabel } from '@/components/SkillPicker';
import { Avatar, Body, Button, Card, Field, ListRow, Screen, SectionHeader } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { initialsOf } from '@/lib/format';
import { addFriend, fetchFriends, fetchRecentOpponents, FriendRow, OpponentRow, Relation, relationLabel, removeFriend } from '@/lib/friends';
import { nearbyPlayers } from '@/lib/sample-data';
import { supabase } from '@/lib/supabase';

function lastSeenText(iso: string, played: boolean) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  const when = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  return `${played ? 'Played' : 'Challenged'} ${when}`;
}

export default function FriendsScreen() {
  const { demoMode } = useAuth();
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [opponents, setOpponents] = useState<OpponentRow[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FriendRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [f, o] = await Promise.all([fetchFriends(demoMode), fetchRecentOpponents(demoMode)]);
    setFriends(f);
    setOpponents(o);
  }, [demoMode]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const q = query.trim();
  useEffect(() => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    if (demoMode || !supabase) {
      setResults(
        nearbyPlayers
          .filter((p) => p.username.includes(q.toLowerCase()) || p.name.toLowerCase().includes(q.toLowerCase()))
          .map((p) => ({ id: p.id, name: p.name, username: p.username, skill: p.skill, relation: null })),
      );
      return;
    }
    const timer = setTimeout(async () => {
      const { data } = await supabase!.rpc('search_players', { p_query: q });
      setResults(
        ((data ?? []) as { profile_id: string; display_name: string; username: string; skill_level: number | null }[]).map((p) => ({
          id: p.profile_id,
          name: p.display_name,
          username: p.username,
          skill: p.skill_level,
          relation: null,
        })),
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [q, demoMode]);

  // The latest relation for a player, from whichever list knows it.
  const relationOf = (id: string, fallback: Relation): Relation => friends.find((f) => f.id === id)?.relation ?? fallback;

  const setRelation = (id: string, person: FriendRow, relation: Relation) => {
    setFriends((list) => {
      const rest = list.filter((f) => f.id !== id);
      return relation ? [...rest, { ...person, relation }] : rest;
    });
    setOpponents((list) => list.map((o) => (o.id === id ? { ...o, relation } : o)));
  };

  const add = async (person: FriendRow) => {
    setBusy(person.id);
    try {
      setRelation(person.id, person, await addFriend(demoMode, person.id, relationOf(person.id, person.relation)));
    } catch (error) {
      Alert.alert("Couldn't send that", error instanceof Error ? error.message : 'Try again.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (person: FriendRow) => {
    setBusy(person.id);
    try {
      await removeFriend(demoMode, person.id);
      setRelation(person.id, person, null);
    } catch (error) {
      Alert.alert("Couldn't do that", error instanceof Error ? error.message : 'Try again.');
    } finally {
      setBusy(null);
    }
  };

  // Friends open your inbox with them; everyone else opens their player page.
  const row = (person: FriendRow, subtitle: string, right: ReactNode, inbox = false) => (
    <Link
      key={person.id}
      href={inbox ? { pathname: '/friends/[id]', params: { id: person.id, name: person.name } } : { pathname: '/player/[id]', params: { id: person.id } }}
      asChild>
      <Pressable accessibilityRole="link">
        <ListRow left={<Avatar initials={initialsOf(person.name)} size={40} />} title={person.name} subtitle={subtitle} right={right} />
      </Pressable>
    </Link>
  );

  const addButton = (person: FriendRow) => {
    const relation = relationOf(person.id, person.relation);
    if (relation === 'friend') return <Body size={14} weight="bold" tone="accent">Friends</Body>;
    return (
      <Button
        label={relationLabel(relation)}
        variant={relation === 'outgoing' ? 'ghost' : 'outline'}
        size="sm"
        disabled={busy === person.id || relation === 'outgoing'}
        onPress={() => add(person)}
      />
    );
  };

  const incoming = friends.filter((f) => f.relation === 'incoming');
  const accepted = friends.filter((f) => f.relation === 'friend');
  const sent = friends.filter((f) => f.relation === 'outgoing');

  return (
    <Screen>
      <Field label="Add a friend" placeholder="Search by username" autoCapitalize="none" autoCorrect={false} value={query} onChangeText={setQuery} />
      {results.map((p) => row(p, `@${p.username}`, addButton(p)))}
      {q.length >= 2 && results.length === 0 ? <Body tone="muted">No player matches &ldquo;{q}&rdquo;.</Body> : null}

      {incoming.length > 0 ? (
        <View style={{ gap: 8 }}>
          <SectionHeader title="Friend requests" detail={`${incoming.length}`} />
          {incoming.map((p) =>
            row(
              p,
              `@${p.username} wants to be friends`,
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Button label="No" variant="ghost" size="sm" disabled={busy === p.id} onPress={() => remove(p)} />
                <Button label="Accept" size="sm" disabled={busy === p.id} onPress={() => add(p)} />
              </View>,
            ),
          )}
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <SectionHeader title="Friends" detail={`${accepted.length}`} />
        {accepted.length === 0 ? (
          <Card style={{ padding: 16 }}>
            <Body tone="muted">No friends yet. Add people you play with below, or search for them.</Body>
          </Card>
        ) : null}
        {accepted.map((p) =>
          row(p, [`@${p.username}`, skillLabel(p.skill)].filter(Boolean).join(' · '), <Body size={14} weight="bold" tone="accent">Open</Body>, true),
        )}
      </View>

      <View style={{ gap: 8 }}>
        <SectionHeader title="Played with or against" />
        {opponents.length === 0 ? (
          <Card style={{ padding: 16 }}>
            <Body tone="muted">Everyone you challenge or play shows up here, so you can friend them after.</Body>
          </Card>
        ) : null}
        {opponents.map((p) => row(p, lastSeenText(p.lastSeen, p.played), addButton(p)))}
      </View>

      {sent.length > 0 ? (
        <View style={{ gap: 8 }}>
          <SectionHeader title="Requests you sent" />
          {sent.map((p) =>
            row(p, `@${p.username}`, <Button label="Cancel" variant="ghost" size="sm" disabled={busy === p.id} onPress={() => remove(p)} />),
          )}
        </View>
      ) : null}
    </Screen>
  );
}

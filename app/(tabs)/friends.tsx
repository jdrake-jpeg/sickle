import { Link, useFocusEffect } from 'expo-router';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { skillLabel } from '@/components/SkillPicker';
import { Avatar, Body, Button, Card, Chip, Display, InfoDrop, ListRow, Screen, SearchField, SectionHeader } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { Conversation, fetchConversations } from '@/lib/chat';
import { initialsOf } from '@/lib/format';
import {
  addFriend,
  fetchFriends,
  fetchRecentOpponents,
  fetchSimilarPlayers,
  FriendRow,
  OpponentRow,
  Relation,
  relationLabel,
  removeFriend,
  SimilarPlayer,
} from '@/lib/friends';
import { formatTags } from '@/lib/play';
import { useProfile } from '@/lib/profile';
import { nearbyPlayers } from '@/lib/sample-data';
import { supabase } from '@/lib/supabase';
import { useClearOnBlur } from '@/lib/use-clear-on-blur';

function lastSeenText(iso: string, played: boolean) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  const when = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  return `${played ? 'Played' : 'Challenged'} ${when}`;
}

export default function FriendsScreen() {
  const { demoMode } = useAuth();
  const { profile } = useProfile();
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [opponents, setOpponents] = useState<OpponentRow[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FriendRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [chats, setChats] = useState<Conversation[]>([]);
  const [format, setFormat] = useState<'any' | 'singles' | 'doubles'>('any');
  const [similar, setSimilar] = useState<SimilarPlayer[]>([]);

  const load = useCallback(async () => {
    const [f, o, c, sim] = await Promise.all([
      fetchFriends(demoMode),
      fetchRecentOpponents(demoMode),
      fetchConversations(demoMode),
      fetchSimilarPlayers(demoMode, format === 'any' ? null : format),
    ]);
    setFriends(f);
    setOpponents(o);
    setChats(c);
    setSimilar(sim);
  }, [demoMode, format]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useClearOnBlur(() => setQuery(''));

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

  // Friends open your chat with them; everyone else opens their player page.
  const row = (person: FriendRow, subtitle: string, right: ReactNode, inbox = false) => (
    <Link
      key={person.id}
      href={inbox ? { pathname: '/chat/[id]', params: { id: person.id, name: person.name } } : { pathname: '/player/[id]', params: { id: person.id } }}
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

  const askUnfriend = (person: FriendRow) =>
    Alert.alert(`Unfriend ${person.name.split(' ')[0]}?`, "You won't be able to chat. You can add each other again later.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unfriend', style: 'destructive', onPress: () => remove(person) },
    ]);

  const incoming = friends.filter((f) => f.relation === 'incoming');
  const accepted = friends.filter((f) => f.relation === 'friend');
  const sent = friends.filter((f) => f.relation === 'outgoing');

  return (
    <Screen>
      <View style={{ height: 44, justifyContent: 'center' }}>
        <Display>FRIENDS</Display>
      </View>
      <InfoDrop title="What are friends for?">
        <Body size={13} tone="muted">
          Friends can chat with you and team up with you for doubles. You can only make a team with someone who is your friend.
        </Body>
        <Body size={13} tone="muted">
          To add someone, search their name below, or tap a player you played against. They need to accept before you are friends.
        </Body>
      </InfoDrop>
      <SearchField label="Find a player" placeholder="Name or username" value={query} onChangeText={setQuery} />
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
        {accepted.map((p) => {
          const chat = chats.find((c) => c.friend_id === p.id);
          return row(
            p,
            chat ? `${chat.last_mine ? 'You: ' : ''}${chat.last_body}` : [`@${p.username}`, skillLabel(p.skill)].filter(Boolean).join(' · '),
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              {chat && chat.unread > 0 ? (
                <Body size={13} weight="bold" tone="danger">
                  {chat.unread} new
                </Body>
              ) : (
                <Body size={13} weight="bold" tone="accent">
                  Chat
                </Body>
              )}
              <Pressable accessibilityRole="button" disabled={busy === p.id} onPress={() => askUnfriend(p)} hitSlop={8}>
                <Body size={12} tone="muted">
                  Unfriend
                </Body>
              </Pressable>
            </View>,
            true,
          );
        })}
      </View>

      <View style={{ gap: 8 }}>
        <SectionHeader title="Players at your level" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(['any', 'singles', 'doubles'] as const).map((f) => (
            <Chip key={f} label={f === 'any' ? 'Singles or doubles' : f === 'singles' ? 'Singles' : 'Doubles'} selected={f === format} onPress={() => setFormat(f)} />
          ))}
        </View>
        {profile?.skill_level == null ? (
          <Card style={{ padding: 16 }}>
            <Body tone="muted">Set your skill level in Settings and Sickle shows you players at about your level.</Body>
          </Card>
        ) : similar.length === 0 ? (
          <Card style={{ padding: 16 }}>
            <Body tone="muted">Nobody at your level yet. Check back as more players join.</Body>
          </Card>
        ) : null}
        {similar.map((p) =>
          row(
            p,
            [`@${p.username}`, skillLabel(p.skill), p.lookingNow ? 'Looking to play now' : null, formatTags(p)].filter(Boolean).join(' · '),
            addButton(p),
          ),
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

import { Link, useFocusEffect } from 'expo-router';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { FilterChips, FilterGroup, Filters } from '@/components/Filters';
import { ShowMore, usePaged } from '@/components/ShowMore';
import { ratingText, RatingGuide } from '@/components/SkillPicker';
import { Avatar, Body, Button, Card, Display, ListRow, Screen, SearchField, SectionHeader } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { initialsOf } from '@/lib/format';
import {
  addFriend,
  fetchFindPlayers,
  fetchFriends,
  fetchRecentOpponents,
  FindPlayer,
  FindScope,
  FriendRow,
  OpponentRow,
  ratingRanges,
  Relation,
  relationLabel,
} from '@/lib/friends';
import { getLocationIfAllowed, LatLng } from '@/lib/location';
import { nearbyPlayers } from '@/lib/sample-data';
import { supabase } from '@/lib/supabase';
import { useClearOnBlur } from '@/lib/use-clear-on-blur';

function lastSeenText(iso: string, played: boolean) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  const when = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  return `${played ? 'Played' : 'Challenged'} ${when}`;
}

type Miles = 'any' | '5' | '10' | '25';

// Find people: search, or browse with filters. Your friends list is on your profile.
export default function FindPeopleScreen() {
  const { demoMode } = useAuth();
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [opponents, setOpponents] = useState<OpponentRow[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FriendRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [rating, setRating] = useState(ratingRanges[0].label);
  const [miles, setMiles] = useState<Miles>('any');
  const [common, setCommon] = useState<'any' | 'common'>('any');
  const [scope, setScope] = useState<FindScope>('people');
  const [place, setPlace] = useState<LatLng | null>(null);
  const [browse, setBrowse] = useState<FindPlayer[] | null>(null);

  useClearOnBlur(() => setQuery(''));

  const loadPeople = useCallback(async () => {
    const [f, o] = await Promise.all([fetchFriends(demoMode), fetchRecentOpponents(demoMode)]);
    setFriends(f);
    setOpponents(o);
  }, [demoMode]);

  useFocusEffect(
    useCallback(() => {
      loadPeople();
      getLocationIfAllowed().then(setPlace);
    }, [loadPeople]),
  );

  // The list follows the filters.
  useEffect(() => {
    const range = ratingRanges.find((r) => r.label === rating)!;
    let alive = true;
    setBrowse(null);
    fetchFindPlayers(demoMode, {
      range,
      place,
      miles: miles === 'any' ? null : Number(miles),
      common: common === 'common',
      scope,
    }).then((rows) => alive && setBrowse(rows));
    return () => {
      alive = false;
    };
    // The place only matters when the phone's position changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode, rating, miles, common, scope, place?.lat, place?.lng]);

  const filterCount = (rating !== ratingRanges[0].label ? 1 : 0) + (miles !== 'any' ? 1 : 0) + (common === 'common' ? 1 : 0) + (scope !== 'people' ? 1 : 0);
  const clearFilters = () => {
    setRating(ratingRanges[0].label);
    setMiles('any');
    setCommon('any');
    setScope('people');
  };

  const q = query.trim();
  const searching = q.length >= 2;
  useEffect(() => {
    if (!searching) {
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
  }, [q, searching, demoMode]);

  const relationOf = (id: string, fallback: Relation): Relation => friends.find((f) => f.id === id)?.relation ?? fallback;

  const add = async (person: FriendRow) => {
    setBusy(person.id);
    try {
      const next = await addFriend(demoMode, person.id, relationOf(person.id, person.relation));
      setFriends((list) => [...list.filter((f) => f.id !== person.id), { ...person, relation: next }]);
    } catch (error) {
      Alert.alert("Couldn't send that", error instanceof Error ? error.message : 'Try again.');
    } finally {
      setBusy(null);
    }
  };

  const row = (person: FriendRow, subtitle: string, right: ReactNode) => (
    <Link key={person.id} href={{ pathname: '/player/[id]', params: { id: person.id } }} asChild>
      <Pressable accessibilityRole="link">
        <ListRow left={<Avatar initials={initialsOf(person.name)} size={40} />} title={person.name} subtitle={subtitle} right={right} />
      </Pressable>
    </Link>
  );

  const addButton = (person: FriendRow) => {
    const relation = relationOf(person.id, person.relation);
    if (relation === 'friend') {
      return (
        <Body size={14} weight="bold" tone="accent">
          Friends
        </Body>
      );
    }
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
  const met = opponents.filter((o) => relationOf(o.id, o.relation) !== 'friend');
  const browsePaged = usePaged(browse ?? [], 6);
  const metPaged = usePaged(met, 5);
  const searchPaged = usePaged(results, 8);

  const found = (p: FindPlayer) =>
    [
      `@${p.username}`,
      ratingText(p.skill),
      p.distance !== null ? `${p.distance} mi away` : null,
      p.mutual > 0 ? `${p.mutual} ${p.mutual === 1 ? 'friend' : 'friends'} in common` : null,
      p.lookingNow ? 'Looking to play' : null,
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <Screen>
      <View style={{ height: 44, justifyContent: 'center' }}>
        <Display>FIND PEOPLE</Display>
      </View>

      {incoming.length > 0 ? (
        <Link href="/my-friends" asChild>
          <Pressable accessibilityRole="link">
            <Card highlighted style={{ padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Body weight="bold">
                {incoming.length} friend {incoming.length === 1 ? 'request' : 'requests'}
              </Body>
              <Body weight="bold" tone="accent">
                Answer
              </Body>
            </Card>
          </Pressable>
        </Link>
      ) : null}

      <SearchField label="Search by name or username" placeholder="Name or username" value={query} onChangeText={setQuery} />

      {searching ? (
        <View style={{ gap: 8 }}>
          {searchPaged.shown.map((p) => row(p, `@${p.username}`, addButton(p)))}
          <ShowMore hasMore={searchPaged.hasMore} remaining={searchPaged.remaining} onPress={searchPaged.more} />
          {results.length === 0 ? <Body tone="muted">No player matches &ldquo;{q}&rdquo;.</Body> : null}
        </View>
      ) : (
        <>
          <Filters active={filterCount} onClear={clearFilters}>
            <FilterGroup label="Rating">
              <FilterChips options={ratingRanges.map((r) => ({ value: r.label, label: r.label }))} value={rating} onChange={setRating} />
              <RatingGuide />
            </FilterGroup>
            <FilterGroup label="Nearby" hint={place ? undefined : 'Needs location. Turn it on in your phone settings.'}>
              <FilterChips<Miles>
                options={[
                  { value: 'any', label: 'Anywhere' },
                  { value: '5', label: '5 miles' },
                  { value: '10', label: '10 miles' },
                  { value: '25', label: '25 miles' },
                ]}
                value={miles}
                onChange={setMiles}
              />
            </FilterGroup>
            <FilterGroup label="Friends in common">
              <FilterChips
                options={[
                  { value: 'any', label: 'Anyone' },
                  { value: 'common', label: 'Has friends in common' },
                ]}
                value={common}
                onChange={setCommon}
              />
            </FilterGroup>
            <FilterGroup label="Show">
              <FilterChips<FindScope>
                options={[
                  { value: 'people', label: 'New people' },
                  { value: 'friends', label: 'My friends' },
                  { value: 'all', label: 'Everyone' },
                ]}
                value={scope}
                onChange={setScope}
              />
            </FilterGroup>
          </Filters>

          <View style={{ gap: 8 }}>
            <SectionHeader title="Players" detail={browse ? `${browse.length}` : undefined} />
            {browse === null ? <Body tone="muted">Loading…</Body> : null}
            {browse && browse.length === 0 ? (
              <Card style={{ padding: 16 }}>
                <Body tone="muted">Nobody matches. Try changing the filters.</Body>
              </Card>
            ) : null}
            {browsePaged.shown.map((p) => row(p, found(p), addButton(p)))}
            <ShowMore hasMore={browsePaged.hasMore} remaining={browsePaged.remaining} onPress={browsePaged.more} />
          </View>

          <View style={{ gap: 8 }}>
            <SectionHeader title="Played with or against" />
            {met.length === 0 ? (
              <Card style={{ padding: 16 }}>
                <Body tone="muted">Players you challenge or play show up here.</Body>
              </Card>
            ) : null}
            {metPaged.shown.map((p) => row(p, lastSeenText(p.lastSeen, p.played), addButton(p)))}
            <ShowMore hasMore={metPaged.hasMore} remaining={metPaged.remaining} onPress={metPaged.more} />
          </View>
        </>
      )}
    </Screen>
  );
}

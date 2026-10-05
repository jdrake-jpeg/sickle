import { supabase } from '@/lib/supabase';

// friend: you're friends. incoming: they asked you. outgoing: you asked them.
export type Relation = 'friend' | 'incoming' | 'outgoing' | null;

export type FriendRow = { id: string; name: string; username: string; skill: number | null; relation: Relation };
export type OpponentRow = FriendRow & { lastSeen: string; played: boolean };

// Demo mode stand-ins, so the screens can be looked at without Supabase.
const demoFriends: FriendRow[] = [
  { id: 'p1', name: 'Jack Thompson', username: 'jackt', skill: 3.8, relation: 'friend' },
  { id: 'p2', name: 'Abby Larsen', username: 'abbyl', skill: 3.6, relation: 'incoming' },
];
const demoOpponents: OpponentRow[] = [
  { id: 'p3', name: 'Marcus Bell', username: 'mbell', skill: 4.0, relation: null, lastSeen: '2026-10-01T18:00:00Z', played: true },
  { id: 'p1', name: 'Jack Thompson', username: 'jackt', skill: 3.8, relation: 'friend', lastSeen: '2026-09-29T18:00:00Z', played: true },
];

type DbPerson = { profile_id: string; display_name: string; username: string; skill_level: number | null; relation: Relation };

const toRow = (p: DbPerson): FriendRow => ({ id: p.profile_id, name: p.display_name, username: p.username, skill: p.skill_level, relation: p.relation });

export async function fetchFriends(demoMode: boolean): Promise<FriendRow[]> {
  if (demoMode || !supabase) return demoFriends;
  const { data } = await supabase.rpc('my_friends');
  return ((data ?? []) as DbPerson[]).map(toRow);
}

export async function fetchRecentOpponents(demoMode: boolean): Promise<OpponentRow[]> {
  if (demoMode || !supabase) return demoOpponents;
  const { data } = await supabase.rpc('recent_opponents');
  return ((data ?? []) as (DbPerson & { last_seen: string; played: boolean })[]).map((p) => ({
    ...toRow(p),
    lastSeen: p.last_seen,
    played: p.played,
  }));
}

export async function fetchRelation(demoMode: boolean, profileId: string): Promise<Relation> {
  if (demoMode || !supabase) return demoFriends.find((f) => f.id === profileId)?.relation ?? null;
  const { data } = await supabase.rpc('my_friends');
  return ((data ?? []) as DbPerson[]).find((p) => p.profile_id === profileId)?.relation ?? null;
}

// Sends a request, or accepts theirs. Returns the new relation.
export async function addFriend(demoMode: boolean, profileId: string, current: Relation): Promise<Relation> {
  if (demoMode || !supabase) return current === 'incoming' ? 'friend' : 'outgoing';
  const { data, error } = await supabase.rpc('add_friend', { p_profile: profileId });
  if (error) throw error;
  return data === 'accepted' ? 'friend' : 'outgoing';
}

// Declines, cancels or unfriends.
export async function removeFriend(demoMode: boolean, profileId: string) {
  if (demoMode || !supabase) return;
  const { error } = await supabase.rpc('remove_friend', { p_profile: profileId });
  if (error) throw error;
}

export function relationLabel(relation: Relation) {
  return relation === 'friend' ? 'Friends' : relation === 'outgoing' ? 'Requested' : relation === 'incoming' ? 'Accept' : 'Add friend';
}

// People at about your skill level who aren't your friends yet. Needs the
// 20261013 database update (and a skill level set), otherwise it's empty.
export type SimilarPlayer = FriendRow & { lookingNow: boolean; plays_singles: boolean; plays_doubles: boolean };

export async function fetchSimilarPlayers(demoMode: boolean, format: 'singles' | 'doubles' | null): Promise<SimilarPlayer[]> {
  if (demoMode || !supabase) {
    return [{ id: 'p3', name: 'Marcus Bell', username: 'mbell', skill: 4.0, relation: null, lookingNow: true, plays_singles: true, plays_doubles: true }];
  }
  const { data, error } = await supabase.rpc('similar_players', format ? { p_format: format } : {});
  if (error) return [];
  return ((data ?? []) as (DbPerson & { looking_now: boolean; plays_singles: boolean; plays_doubles: boolean })[]).map((p) => ({
    id: p.profile_id,
    name: p.display_name,
    username: p.username,
    skill: p.skill_level,
    relation: null,
    lookingNow: p.looking_now,
    plays_singles: p.plays_singles,
    plays_doubles: p.plays_doubles,
  }));
}

// Rating groups on the DUPR scale. DUPR ratings have decimals, like 3.74.
export const ratingRanges: { label: string; min: number | null; max: number | null }[] = [
  { label: 'Any rating', min: null, max: null },
  { label: 'Under 3.0', min: null, max: 2.99 },
  { label: '3.0 to 3.9', min: 3.0, max: 3.99 },
  { label: '4.0 to 4.9', min: 4.0, max: 4.99 },
  { label: '5.0 and up', min: 5.0, max: null },
];

export type FindPlayer = SimilarPlayer & { mutual: number; distance: number | null };
export type FindScope = 'people' | 'friends' | 'all';
export type FindArgs = {
  range: { min: number | null; max: number | null };
  place: { lat: number; lng: number } | null;
  miles: number | null;
  common: boolean;
  scope: FindScope;
};

type DbFound = DbPerson & {
  looking_now: boolean;
  plays_singles: boolean;
  plays_doubles: boolean;
  mutual_friends: number;
  is_friend: boolean;
  distance_miles: number | null;
};

// Players you could play with: by rating, how close, friends in common, or your
// friends. Needs the 20261019 database update; before that it falls back to
// people near your own level.
export async function fetchFindPlayers(demoMode: boolean, a: FindArgs): Promise<FindPlayer[]> {
  const plain = (rows: SimilarPlayer[]): FindPlayer[] => rows.map((r) => ({ ...r, mutual: 0, distance: null }));
  if (demoMode || !supabase) return plain(await fetchSimilarPlayers(demoMode, null));
  const { data, error } = await supabase.rpc('find_players', {
    p_min_skill: a.range.min,
    p_max_skill: a.range.max,
    p_lat: a.place?.lat ?? null,
    p_lng: a.place?.lng ?? null,
    p_radius_miles: a.miles,
    p_common_only: a.common,
    p_scope: a.scope,
  });
  if (error) return plain(await fetchSimilarPlayers(demoMode, null));
  return ((data ?? []) as DbFound[]).map((p) => ({
    id: p.profile_id,
    name: p.display_name,
    username: p.username,
    skill: p.skill_level,
    relation: p.is_friend ? 'friend' : null,
    lookingNow: p.looking_now,
    plays_singles: p.plays_singles,
    plays_doubles: p.plays_doubles,
    mutual: Number(p.mutual_friends ?? 0),
    distance: p.distance_miles === null ? null : Number(p.distance_miles),
  }));
}

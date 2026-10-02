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

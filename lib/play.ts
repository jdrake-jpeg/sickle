import { supabase } from '@/lib/supabase';

// Who you play, who can challenge you, and court champion crowns.
// These come from the 20261013 database update. On a database that doesn't
// have it yet, everything here quietly falls back to "no limits, no crowns".

export type ChallengesFrom = 'everyone' | 'friends';

export type PlaySettings = {
  plays_singles: boolean;
  plays_doubles: boolean;
  challenges_from: ChallengesFrom;
  friend_requests: boolean;
};

export const defaultPlaySettings: PlaySettings = { plays_singles: true, plays_doubles: true, challenges_from: 'everyone', friend_requests: true };

// null if the database doesn't have the settings yet.
export async function fetchPlaySettings(demoMode: boolean, profileId: string | undefined): Promise<PlaySettings | null> {
  if (demoMode || !supabase) return defaultPlaySettings;
  if (!profileId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('plays_singles, plays_doubles, challenges_from, friend_requests')
    .eq('id', profileId)
    .maybeSingle();
  if (error || !data) return null;
  // 'nobody' was removed; old rows count as everyone.
  return { ...data, challenges_from: data.challenges_from === 'friends' ? 'friends' : 'everyone' } as PlaySettings;
}

export async function savePlaySettings(demoMode: boolean, profileId: string, change: Partial<PlaySettings>): Promise<void> {
  if (demoMode || !supabase) return;
  const { error } = await supabase.from('profiles').update(change).eq('id', profileId);
  if (error) throw new Error(error.message);
}

export type PlayerOpen = {
  can_challenge: boolean;
  challenge_note: string | null;
  can_friend: boolean;
  plays_singles: boolean;
  plays_doubles: boolean;
};

export async function fetchPlayerOpen(demoMode: boolean, profileId: string): Promise<PlayerOpen> {
  const open: PlayerOpen = { can_challenge: true, challenge_note: null, can_friend: true, plays_singles: true, plays_doubles: true };
  if (demoMode || !supabase) return open;
  const { data, error } = await supabase.rpc('player_open', { p_profile: profileId });
  if (error) return open;
  return ((data ?? []) as PlayerOpen[])[0] ?? open;
}

export type Crown = { court_id: string; court_name: string; is_singles: boolean; wins: number };

export async function fetchPlayerCrowns(demoMode: boolean, profileId: string): Promise<Crown[]> {
  if (demoMode || !supabase) return [];
  const { data, error } = await supabase.rpc('player_crowns', { p_profile: profileId });
  return error ? [] : ((data ?? []) as Crown[]);
}

export async function fetchTeamCrowns(demoMode: boolean, teamId: string): Promise<Crown[]> {
  if (demoMode || !supabase) return [];
  const { data, error } = await supabase.rpc('team_crowns', { p_team: teamId });
  return error ? [] : ((data ?? []) as Crown[]);
}

// A team needs this many wins at a court, and the #1 spot, to be its champion.
export const championWins = 6;

export const crownText = (c: Crown) => `${c.court_name} (${c.is_singles ? 'singles' : 'doubles'}, ${c.wins} wins)`;

// "Singles · Doubles", or empty when we don't know (search results).
export const formatTags = (p: { plays_singles?: boolean; plays_doubles?: boolean }) =>
  p.plays_singles === undefined && p.plays_doubles === undefined
    ? ''
    : [p.plays_singles === false ? null : 'Singles', p.plays_doubles === false ? null : 'Doubles'].filter(Boolean).join(' · ');

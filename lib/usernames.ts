import { supabase } from '@/lib/supabase';

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

// People type "@johndoe" out of habit; the @ is not part of the username.
export function cleanUsername(raw: string) {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

export type UsernameStatus = 'free' | 'taken' | 'unknown';

// Asks the database whether a username is free. "unknown" means we couldn't
// find out (no connection, or the check isn't set up yet). That is never shown
// as "taken", so a flaky connection can't block someone from signing up.
export async function checkUsername(name: string): Promise<UsernameStatus> {
  if (!supabase) return 'unknown';
  try {
    const { data, error } = await supabase.rpc('username_available', { p_username: name });
    if (error || typeof data !== 'boolean') return 'unknown';
    return data ? 'free' : 'taken';
  } catch {
    return 'unknown';
  }
}

// True when an error message looks like a dropped connection, not a rule.
export function looksOffline(message: string) {
  return /network|fetch|timed? ?out|offline|connection/i.test(message);
}

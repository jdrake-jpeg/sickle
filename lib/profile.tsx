import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { me } from '@/lib/sample-data';
import { supabase } from '@/lib/supabase';

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  skill_level: number | null;
  is_admin: boolean;
};

type ProfileState = {
  // True once we know whether the signed-in player has a profile.
  ready: boolean;
  profile: Profile | null;
  refresh: () => Promise<void>;
};

// In demo mode you're the sample player and an admin, so every screen shows.
const demoProfile: Profile = { id: 'demo', username: me.username, display_name: me.name, skill_level: me.skill, is_admin: true };

const ProfileContext = createContext<ProfileState>({ ready: false, profile: null, refresh: async () => {} });

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { session, demoMode } = useAuth();
  const userId = session?.user.id;
  const [state, setState] = useState<{ ready: boolean; profile: Profile | null }>({
    ready: demoMode,
    profile: demoMode ? demoProfile : null,
  });

  const refresh = useCallback(async () => {
    if (!supabase || !userId) {
      setState({ ready: true, profile: null });
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, skill_level, is_admin')
      .eq('id', userId)
      .maybeSingle();
    // On a network error keep what we had rather than sending them to setup.
    if (error) setState((s) => ({ ...s, ready: true }));
    else setState({ ready: true, profile: data as Profile | null });
  }, [userId]);

  useEffect(() => {
    if (demoMode) return;
    setState({ ready: false, profile: null });
    refresh();
  }, [demoMode, refresh]);

  return <ProfileContext.Provider value={{ ...state, refresh }}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  return useContext(ProfileContext);
}

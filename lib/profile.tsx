import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth';
import { kv } from '@/lib/kv';
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
  // Reloads the profile. Returns false when the server couldn't be reached.
  refresh: () => Promise<boolean>;
  // True when the player is an admin AND has admin mode on. Use this to show
  // admin tools, so admins can flip to the normal player view.
  isAdmin: boolean;
  // Admin mode on or off. Only matters for admins.
  adminMode: boolean;
  setAdminMode: (on: boolean) => void;
};

// In demo mode you're the sample player and an admin, so every screen shows.
const demoProfile: Profile = { id: 'demo', username: me.username, display_name: me.name, skill_level: me.skill, is_admin: true };

const adminModeKey = 'sickle.adminMode';

function readAdminMode() {
  try {
    return kv.getItemSync(adminModeKey) !== 'off';
  } catch {
    return true;
  }
}

const ProfileContext = createContext<ProfileState>({
  ready: false,
  profile: null,
  refresh: async () => true,
  isAdmin: false,
  adminMode: true,
  setAdminMode: () => {},
});

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { session, demoMode } = useAuth();
  const userId = session?.user.id;
  const [state, setState] = useState<{ ready: boolean; profile: Profile | null }>({
    ready: demoMode,
    profile: demoMode ? demoProfile : null,
  });

  const [adminMode, setAdminModeState] = useState(readAdminMode);
  const setAdminMode = useCallback((on: boolean) => {
    setAdminModeState(on);
    try {
      kv.setItemSync(adminModeKey, on ? 'on' : 'off');
    } catch {
      // Not saved; it still applies until the app closes.
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!supabase || !userId) {
      setState({ ready: true, profile: null });
      return true;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, skill_level, is_admin')
      .eq('id', userId)
      .maybeSingle();
    // On a network error keep what we had rather than sending them to setup.
    if (error) {
      setState((s) => ({ ...s, ready: true }));
      return false;
    }
    setState({ ready: true, profile: data as Profile | null });
    return true;
  }, [userId]);

  useEffect(() => {
    if (demoMode) return;
    setState({ ready: false, profile: null });
    refresh();
  }, [demoMode, refresh]);

  const isAdmin = Boolean(state.profile?.is_admin) && adminMode;
  return <ProfileContext.Provider value={{ ...state, refresh, isAdmin, adminMode, setAdminMode }}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  return useContext(ProfileContext);
}

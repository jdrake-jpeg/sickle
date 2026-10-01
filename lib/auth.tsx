import type { Session } from '@supabase/supabase-js';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type AuthState = {
  // True once the stored session (if any) has been read.
  ready: boolean;
  session: Session | null;
  // Without a Supabase project the app runs on sample data with no login.
  demoMode: boolean;
};

const AuthContext = createContext<AuthState>({ ready: false, session: null, demoMode: !isSupabaseConfigured });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ ready: !supabase, session: null, demoMode: !isSupabaseConfigured });

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setState((s) => ({ ...s, ready: true, session: data.session })));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setState((s) => ({ ...s, ready: true, session })));
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

import { createClient } from '@supabase/supabase-js';

import { kv } from './kv';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Until a Supabase project is connected the app runs on sample data.
// Once it is, generate typed tables with `npx supabase gen types typescript`.
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        storage: kv,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        // Code flow, needed for Sign in with Google in the app.
        flowType: 'pkce',
      },
    })
  : null;

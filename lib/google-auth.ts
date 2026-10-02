import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from '@/lib/supabase';

// Lets the browser window close itself on web after Google sends you back.
WebBrowser.maybeCompleteAuthSession();

// Signs in (or signs up) with Google through Supabase. Opens Google in a secure
// browser sheet, then trades the code it sends back for a session. Returns
// false if the player closed the sheet.
export async function signInWithGoogle(): Promise<boolean> {
  if (!supabase) throw new Error('Supabase is not connected yet.');
  // exp://… in Expo Go, sickle://auth-callback in a real build. Both must be
  // in Supabase's Redirect URLs list.
  const redirectTo = Linking.createURL('auth-callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return false;

  const { queryParams } = Linking.parse(result.url);
  const failure = queryParams?.error_description ?? queryParams?.error;
  if (failure) throw new Error(String(failure));
  const code = queryParams?.code;
  if (typeof code !== 'string') throw new Error('Google sign-in did not finish. Try again.');

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
  return true;
}

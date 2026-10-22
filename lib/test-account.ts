import { kv } from '@/lib/kv';
import { supabase } from '@/lib/supabase';

// The admin's test player is a real login the database made for them. Switching
// signs in as it and keeps the admin's own session so Switch back can restore it.
const savedKey = 'sickle.adminSession';

export type TestAccount = { test_id: string; display_name: string };

export async function fetchTestAccount(): Promise<TestAccount | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('admin_test_account');
  if (error) return null;
  return ((data ?? []) as TestAccount[])[0] ?? null;
}

export async function createTestAccount(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('admin_create_test_account');
  if (error) {
    throw new Error(error.code === 'PGRST202' ? "The test account update isn't in the database yet. Run the newest file in supabase/migrations." : error.message);
  }
}

export async function enterTestAccount(): Promise<void> {
  if (!supabase) return;
  const current = (await supabase.auth.getSession()).data.session;
  if (!current) throw new Error('Sign in first.');
  const { data, error } = await supabase.rpc('admin_test_account');
  const login = ((data ?? []) as { email: string; password: string }[])[0];
  if (error || !login) throw new Error('Make the test account first.');
  kv.setItemSync(savedKey, JSON.stringify({ access_token: current.access_token, refresh_token: current.refresh_token }));
  const signedIn = await supabase.auth.signInWithPassword({ email: login.email, password: login.password });
  if (signedIn.error) {
    await kv.removeItem(savedKey);
    throw new Error(signedIn.error.message);
  }
}

// Back to the admin. Returns false if the saved session ran out; then you sign in again.
export async function leaveTestAccount(): Promise<boolean> {
  if (!supabase) return false;
  const saved = kv.getItemSync(savedKey);
  await kv.removeItem(savedKey);
  if (saved) {
    try {
      const tokens = JSON.parse(saved) as { access_token: string; refresh_token: string };
      const { error } = await supabase.auth.setSession(tokens);
      if (!error) return true;
    } catch {
      // Falls through to signing out.
    }
  }
  await supabase.auth.signOut();
  return false;
}

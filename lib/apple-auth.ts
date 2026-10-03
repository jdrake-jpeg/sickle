import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// True on iPhones that can show Sign in with Apple. Always false on Android
// and web, where the button is hidden.
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return AppleAuthentication.isAvailableAsync().catch(() => false);
}

// Signs in (or signs up) with Apple through Supabase. Apple's sheet gets a
// hashed nonce and Supabase checks it against the raw one, so a stolen token
// can't be replayed. Returns false if the player closed the sheet.
//
// Only works in a real build (TestFlight or the App Store) with the bundle ID
// listed under Apple in Supabase's sign-in providers. Expo Go signs tokens for
// Expo Go's own bundle ID, so Supabase turns them down.
export async function signInWithApple(): Promise<boolean> {
  if (!supabase) throw new Error('Supabase is not connected yet.');
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return false;
    throw error;
  }
  if (!credential.identityToken) throw new Error('Apple sign-in did not finish. Try again.');

  const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce: rawNonce });
  if (error) throw error;
  return true;
}

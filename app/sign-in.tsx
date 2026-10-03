import * as AppleAuthentication from 'expo-apple-authentication';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Logo } from '@/components/Logo';
import { Body, Button, Field, Screen, Segmented } from '@/components/ui';
import { radius } from '@/constants/theme';
import { isAppleSignInAvailable, signInWithApple } from '@/lib/apple-auth';
import { signInWithGoogle } from '@/lib/google-auth';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

type Mode = 'sign_in' | 'sign_up' | 'reset';

export default function SignInScreen() {
  const { name, colors } = useTheme();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [mode, setMode] = useState<Mode>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const submit = async () => {
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    const trimmed = email.trim();
    const { error } =
      mode === 'sign_in'
        ? await supabase.auth.signInWithPassword({ email: trimmed, password })
        : mode === 'sign_up'
          ? await supabase.auth.signUp({ email: trimmed, password })
          : await supabase.auth.resetPasswordForEmail(trimmed);
    setBusy(false);
    if (error) setMessage({ text: error.message, error: true });
    else if (mode === 'sign_up') setMessage({ text: 'Check your email to confirm your account.', error: false });
    else if (mode === 'reset') setMessage({ text: 'If that email has an account, a reset link is on its way.', error: false });
  };

  useEffect(() => {
    isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  const apple = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await signInWithApple();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Apple sign-in failed.', error: true });
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await signInWithGoogle();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : 'Google sign-in failed.', error: true });
    } finally {
      setBusy(false);
    }
  };

  const label = { sign_in: 'Log in', sign_up: 'Create account', reset: 'Send reset link' }[mode];

  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: 10, paddingTop: 40, paddingBottom: 12 }}>
        <Logo width={260} />
        <Body tone="muted" style={{ textAlign: 'center' }}>
          Find a partner nearby. Challenge up. Take the crown.
        </Body>
      </View>

      {appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={name === 'dark' ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={radius.md}
          style={{ width: '100%', height: 56 }}
          onPress={apple}
        />
      ) : null}
      <Button label="Continue with Google" variant="inverse" size="lg" onPress={google} disabled={busy} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        <Body size={13} tone="muted">
          or use email
        </Body>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      </View>

      <Segmented
        value={mode === 'reset' ? 'sign_in' : mode}
        onChange={(m) => {
          setMode(m);
          setMessage(null);
        }}
        options={[
          { value: 'sign_in', label: 'Log in' },
          { value: 'sign_up', label: 'Sign up' },
        ]}
      />

      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      {mode !== 'reset' ? (
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={mode === 'sign_up' ? 'new-password' : 'current-password'}
        />
      ) : null}

      {message ? (
        <Body tone={message.error ? 'danger' : 'accent'} weight="semibold">
          {message.text}
        </Body>
      ) : null}

      <Button label={busy ? 'One sec…' : label} size="lg" onPress={submit} disabled={busy || !email.trim() || (mode !== 'reset' && password.length < 8)} />
      <Button
        label={mode === 'reset' ? 'Back to log in' : 'Forgot password?'}
        variant="ghost"
        onPress={() => {
          setMode(mode === 'reset' ? 'sign_in' : 'reset');
          setMessage(null);
        }}
      />
      <Body size={13} tone="muted" style={{ textAlign: 'center' }}>
        By continuing you agree to the{' '}
        <Link href="/terms" style={{ color: colors.text, textDecorationLine: 'underline' }}>
          Terms
        </Link>{' '}
        and{' '}
        <Link href="/privacy" style={{ color: colors.text, textDecorationLine: 'underline' }}>
          Privacy Policy
        </Link>
        .
      </Body>
    </Screen>
  );
}

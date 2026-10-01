import { useState } from 'react';
import { View } from 'react-native';

import { Body, Button, Display, Field, Screen, Segmented } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

type Mode = 'sign_in' | 'sign_up' | 'reset';

export default function SignInScreen() {
  const { colors } = useTheme();
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

  const label = { sign_in: 'Log in', sign_up: 'Create account', reset: 'Send reset link' }[mode];

  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: 10, paddingTop: 40, paddingBottom: 12 }}>
        <Display size={64}>SICKLE</Display>
        <View style={{ width: 160, height: 6, backgroundColor: colors.danger, transform: [{ skewX: '-24deg' }] }} />
        <Body tone="muted" style={{ textAlign: 'center' }}>
          Find a partner nearby. Challenge up. Take the crown.
        </Body>
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
    </Screen>
  );
}

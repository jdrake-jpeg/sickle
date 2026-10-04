import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { SkillPicker } from '@/components/SkillPicker';
import { Body, Button, Display, Field, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useProfile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { checkUsername, cleanUsername, looksOffline, USERNAME_PATTERN, UsernameStatus } from '@/lib/usernames';

const OFFLINE = "Couldn't reach Sickle. Check your connection and try again.";

// Shown once after sign-up, before the tabs: every player needs a username.
export default function OnboardingScreen() {
  const { session } = useAuth();
  const { refresh } = useProfile();
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [skill, setSkill] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'checking' | UsernameStatus>('idle');

  const clean = cleanUsername(username);
  const usernameOk = USERNAME_PATTERN.test(clean);

  // Ask whether the username is free once they stop typing.
  useEffect(() => {
    if (!usernameOk) {
      setStatus('idle');
      return;
    }
    setStatus('checking');
    let stale = false;
    const timer = setTimeout(async () => {
      const result = await checkUsername(clean);
      if (!stale) setStatus(result);
    }, 400);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [clean, usernameOk]);

  // Loads the saved profile, which sends them on into the app.
  const finish = async () => {
    if (!(await refresh())) {
      setError("You're signed up, but we couldn't load your profile. Check your connection and tap Start playing again.");
    }
  };

  const save = async () => {
    if (!supabase || !session) return;
    setBusy(true);
    setError(null);
    try {
      // A past try may have saved the profile before the connection dropped.
      // If so, carry on into the app instead of saving it a second time.
      const existing = await supabase.from('profiles').select('id').eq('id', session.user.id).maybeSingle();
      if (existing.error) {
        setError(OFFLINE);
        return;
      }
      if (existing.data) {
        await finish();
        return;
      }

      const { error: insertError } = await supabase.from('profiles').insert({
        id: session.user.id,
        username: clean,
        display_name: name.trim(),
        skill_level: skill,
      });
      if (insertError) {
        if (insertError.code === '23505') {
          // "Already exists" can mean the username OR this player's own profile.
          if (/username/i.test(`${insertError.message} ${insertError.details ?? ''}`)) setStatus('taken');
          else await finish();
          return;
        }
        setError(looksOffline(insertError.message) ? OFFLINE : `Couldn't save your profile: ${insertError.message}`);
        return;
      }
      await finish();
    } catch {
      setError(OFFLINE);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ gap: 6, paddingTop: 40 }}>
        <Display size={34}>SET UP YOUR PROFILE</Display>
        <Body tone="muted">This is how other players find you and team up.</Body>
      </View>

      <Field
        label="Username"
        placeholder="@johndoe"
        autoCapitalize="none"
        autoCorrect={false}
        value={username}
        onChangeText={setUsername}
        maxLength={21}
      />
      {username.length > 0 && !usernameOk ? (
        <Body size={13} tone="danger">
          3 to 20 letters, numbers or underscores.
        </Body>
      ) : status === 'checking' ? (
        <Body size={13} tone="muted">
          Checking…
        </Body>
      ) : status === 'free' ? (
        <Body size={13} tone="accent" weight="semibold">
          ✓ @{clean} is free
        </Body>
      ) : status === 'taken' ? (
        <Body size={13} tone="danger" weight="semibold">
          @{clean} is already taken. Try another.
        </Body>
      ) : null}

      <Field label="First and last name" placeholder="John Doe" value={name} onChangeText={setName} maxLength={40} />
      <Body size={13} tone="muted">
        Tip: use your real first and last name. It makes it much easier for friends to find you.
      </Body>

      <SkillPicker value={skill} onChange={setSkill} />

      {error ? (
        <Body tone="danger" weight="semibold">
          {error}
        </Body>
      ) : null}
      <Button
        label={busy ? 'Saving…' : 'Start playing'}
        size="lg"
        onPress={save}
        disabled={busy || !usernameOk || !name.trim() || status === 'taken'}
      />
      <Button label="Log out" variant="ghost" onPress={() => supabase?.auth.signOut()} />
    </Screen>
  );
}

import { useState } from 'react';
import { View } from 'react-native';

import { SkillPicker } from '@/components/SkillPicker';
import { Body, Button, Display, Field, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useProfile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

// Shown once after sign-up, before the tabs: every player needs a username.
export default function OnboardingScreen() {
  const { session } = useAuth();
  const { refresh } = useProfile();
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [skill, setSkill] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanUsername = username.trim().toLowerCase();
  const usernameOk = /^[a-z0-9_]{3,20}$/.test(cleanUsername);

  const save = async () => {
    if (!supabase || !session) return;
    setBusy(true);
    setError(null);
    const { error: insertError } = await supabase.from('profiles').insert({
      id: session.user.id,
      username: cleanUsername,
      display_name: name.trim(),
      skill_level: skill,
    });
    setBusy(false);
    if (insertError) {
      setError(insertError.code === '23505' ? 'That username is taken. Try another.' : insertError.message);
      return;
    }
    await refresh();
  };

  return (
    <Screen>
      <View style={{ gap: 6, paddingTop: 40 }}>
        <Display size={34}>SET UP YOUR PROFILE</Display>
        <Body tone="muted">This is how other players find you and team up.</Body>
      </View>

      <Field
        label="Username"
        placeholder="drake"
        autoCapitalize="none"
        autoCorrect={false}
        value={username}
        onChangeText={setUsername}
      />
      {username.length > 0 && !usernameOk ? (
        <Body size={13} tone="danger">
          3 to 20 letters, numbers or underscores.
        </Body>
      ) : null}
      <Field label="Name" placeholder="Drake Hanna" value={name} onChangeText={setName} maxLength={40} />

      <SkillPicker value={skill} onChange={setSkill} />

      {error ? (
        <Body tone="danger" weight="semibold">
          {error}
        </Body>
      ) : null}
      <Button label={busy ? 'Saving…' : 'Start playing'} size="lg" onPress={save} disabled={busy || !usernameOk || !name.trim()} />
      <Button label="Log out" variant="ghost" onPress={() => supabase?.auth.signOut()} />
    </Screen>
  );
}

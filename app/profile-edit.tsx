import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { SkillPicker } from '@/components/SkillPicker';
import { Body, Button, Field, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useProfile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

// Change your name and skill level. Your username stays the same.
export default function EditProfileScreen() {
  const { demoMode } = useAuth();
  const { profile, refresh } = useProfile();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [skill, setSkill] = useState<number | null>(profile?.skill_level ?? null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (demoMode || !supabase || !profile) {
      router.back();
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ display_name: name.trim(), skill_level: skill }).eq('id', profile.id);
    setBusy(false);
    if (error) {
      Alert.alert("Couldn't save", error.message);
      return;
    }
    await refresh();
    router.back();
  };

  return (
    <Screen>
      <Body tone="muted">@{profile?.username}</Body>
      <Field label="Name" value={name} onChangeText={setName} maxLength={40} />
      <SkillPicker value={skill} onChange={setSkill} />
      <Button label={busy ? 'Saving…' : 'Save'} size="lg" disabled={busy || !name.trim()} onPress={save} />
    </Screen>
  );
}

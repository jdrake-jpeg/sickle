import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { SkillPicker } from '@/components/SkillPicker';
import { Body, Button, Card, Field, Heading, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useProfile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

// Change your name and skill level. Your username is set when you sign up and stays the same.
export default function EditProfileScreen() {
  const { demoMode } = useAuth();
  const { profile, refresh } = useProfile();
  const [skill, setSkill] = useState<number | null>(profile?.skill_level ?? null);
  const [name, setName] = useState(profile?.display_name ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (demoMode || !supabase || !profile) {
      router.back();
      return;
    }
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 40) {
      Alert.alert('Check your name', 'Use 1 to 40 characters.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ skill_level: skill, display_name: trimmed }).eq('id', profile.id);
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
      <Card style={{ padding: 16, gap: 4 }}>
        <Heading size={20}>@{profile?.username}</Heading>
        <Body size={13} tone="muted">
          Your username can&apos;t be changed after you sign up. Your name can.
        </Body>
      </Card>
      <Field label="Name" value={name} onChangeText={setName} maxLength={40} autoCapitalize="words" />
      <SkillPicker value={skill} onChange={setSkill} />
      <Button label={busy ? 'Saving…' : 'Save'} size="lg" disabled={busy} onPress={save} />
    </Screen>
  );
}

import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { SkillPicker } from '@/components/SkillPicker';
import { Body, Button, Card, Heading, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useProfile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

// Change your skill level. Your name and username are set when you sign up and stay the same.
export default function EditProfileScreen() {
  const { demoMode } = useAuth();
  const { profile, refresh } = useProfile();
  const [skill, setSkill] = useState<number | null>(profile?.skill_level ?? null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (demoMode || !supabase || !profile) {
      router.back();
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ skill_level: skill }).eq('id', profile.id);
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
        <Heading size={20}>{(profile?.display_name ?? '').toUpperCase()}</Heading>
        <Body tone="muted">@{profile?.username}</Body>
        <Body size={13} tone="muted">
          Your name and username can&apos;t be changed after you sign up.
        </Body>
      </Card>
      <SkillPicker value={skill} onChange={setSkill} />
      <Button label={busy ? 'Saving…' : 'Save'} size="lg" disabled={busy} onPress={save} />
    </Screen>
  );
}

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { SkillPicker } from '@/components/SkillPicker';
import { Avatar, Body, Button, Card, Field, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { chooseAvatar, removeAvatar } from '@/lib/avatar';
import { initialsOf } from '@/lib/format';
import { useProfile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { checkUsername, cleanUsername, USERNAME_PATTERN, UsernameStatus } from '@/lib/usernames';

// Change your picture, name, username and skill level.
export default function EditProfileScreen() {
  const { demoMode } = useAuth();
  const { profile, refresh } = useProfile();
  const [skill, setSkill] = useState<number | null>(profile?.skill_level ?? null);
  const [name, setName] = useState(profile?.display_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [status, setStatus] = useState<UsernameStatus | 'checking' | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const clean = cleanUsername(username);
  const changed = clean !== (profile?.username ?? '');
  const usernameOk = USERNAME_PATTERN.test(clean);

  // Ask whether a new username is free once they stop typing.
  useEffect(() => {
    if (!changed || !usernameOk) {
      setStatus(null);
      return;
    }
    setStatus('checking');
    const timer = setTimeout(() => checkUsername(clean).then(setStatus), 400);
    return () => clearTimeout(timer);
  }, [clean, changed, usernameOk]);

  const photo = async (action: () => Promise<unknown>) => {
    setPhotoBusy(true);
    try {
      await action();
      await refresh();
    } catch (e) {
      Alert.alert("Couldn't change your picture", e instanceof Error ? e.message : 'Try again.');
    } finally {
      setPhotoBusy(false);
    }
  };

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
    if (changed && !usernameOk) {
      Alert.alert('Check your username', 'Use 3 to 20 letters, numbers or underscores.');
      return;
    }
    if (changed && status === 'taken') {
      Alert.alert('That username is taken', 'Pick another one.');
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from('profiles')
      .update({ skill_level: skill, display_name: trimmed, ...(changed ? { username: clean } : {}) })
      .eq('id', profile.id);
    setBusy(false);
    if (error) {
      Alert.alert("Couldn't save", /username/i.test(error.message) ? 'That username is taken.' : error.message);
      return;
    }
    await refresh();
    router.back();
  };

  return (
    <Screen>
      <Card style={{ padding: 16, alignItems: 'center', gap: 10 }}>
        <Avatar initials={initialsOf(name)} size={96} uri={profile?.avatar_url} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            label={photoBusy ? 'Working…' : profile?.avatar_url ? 'Change picture' : 'Add a picture'}
            variant="outline"
            size="sm"
            disabled={photoBusy || demoMode}
            onPress={() => profile && photo(() => chooseAvatar(profile.id))}
          />
          {profile?.avatar_url ? <Button label="Remove" variant="ghost" size="sm" disabled={photoBusy} onPress={() => profile && photo(() => removeAvatar(profile.id))} /> : null}
        </View>
      </Card>
      <Field label="Name" value={name} onChangeText={setName} maxLength={40} autoCapitalize="words" />
      <View style={{ gap: 6 }}>
        <Field label="Username" value={username} onChangeText={setUsername} maxLength={21} autoCapitalize="none" autoCorrect={false} />
        {changed && !usernameOk ? (
          <Body size={13} tone="danger">
            Use 3 to 20 letters, numbers or underscores.
          </Body>
        ) : null}
        {changed && usernameOk && status === 'taken' ? (
          <Body size={13} tone="danger">
            That username is taken.
          </Body>
        ) : null}
        {changed && usernameOk && status === 'free' ? (
          <Body size={13} tone="accent">
            @{clean} is free.
          </Body>
        ) : null}
      </View>
      <SkillPicker value={skill} onChange={setSkill} />
      <Button label={busy ? 'Saving…' : 'Save'} size="lg" disabled={busy || (changed && (!usernameOk || status === 'taken'))} onPress={save} />
    </Screen>
  );
}

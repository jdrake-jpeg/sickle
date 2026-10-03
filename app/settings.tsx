import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Switch, View } from 'react-native';

import { skillLevels, tierOf } from '@/components/SkillPicker';
import { Body, Button, Card, Chip, Heading, Screen, Segmented } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fetchRatingSummary, RatingSummary } from '@/lib/matches';
import { useProfile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { ThemePreference, useTheme } from '@/lib/theme';

export default function SettingsScreen() {
  const { preference, setPreference } = useTheme();
  const { session, demoMode } = useAuth();
  const { profile, refresh, adminMode, setAdminMode } = useProfile();
  const { colors } = useTheme();
  const [summary, setSummary] = useState<RatingSummary | null>(null);
  // null until loaded; undefined if the database doesn't have the setting yet.
  const [showRecord, setShowRecord] = useState<boolean | null | undefined>(demoMode ? true : null);
  const [skill, setSkill] = useState<number | null>(profile?.skill_level != null ? Number(profile.skill_level) : null);

  useEffect(() => {
    fetchRatingSummary(demoMode).then(setSummary);
    if (demoMode || !supabase || !profile) return;
    supabase
      .from('profiles')
      .select('show_record')
      .eq('id', profile.id)
      .maybeSingle()
      .then(({ data, error }) => setShowRecord(error ? undefined : (data?.show_record ?? true)));
  }, [demoMode, profile]);

  const saveSkill = async (next: number | null) => {
    const before = skill;
    setSkill(next);
    if (demoMode || !supabase || !profile) return;
    const { error } = await supabase.from('profiles').update({ skill_level: next }).eq('id', profile.id);
    if (error) {
      setSkill(before);
      Alert.alert("Couldn't save", error.message);
      return;
    }
    refresh();
  };

  const savePrivacy = async (next: boolean) => {
    setShowRecord(next);
    if (demoMode || !supabase || !profile) return;
    const { error } = await supabase.from('profiles').update({ show_record: next }).eq('id', profile.id);
    if (error) {
      setShowRecord(!next);
      Alert.alert("Couldn't save", error.message);
    }
  };

  const deleteAccount = () => {
    Alert.alert(
      'Delete your account?',
      'This removes your login, profile, friends, ratings and location for good. Matches you already played stay on the other teams\' records as "Deleted player". You can\'t undo this.',
      [
        { text: 'Keep my account', style: 'cancel' },
        {
          text: 'Delete for good',
          style: 'destructive',
          onPress: async () => {
            if (demoMode || !supabase) return;
            const { error } = await supabase.rpc('delete_my_account');
            if (error) {
              Alert.alert("Couldn't delete your account", error.message);
              return;
            }
            await supabase.auth.signOut({ scope: 'local' });
          },
        },
      ],
    );
  };

  const suggested = summary && summary.ratings > 0 && summary.average != null ? Number(summary.average) : null;

  return (
    <Screen>
      <View style={{ gap: 8 }}>
        <Heading>APPEARANCE</Heading>
        <Segmented<ThemePreference>
          value={preference}
          onChange={setPreference}
          options={[
            { value: 'system', label: 'Match phone' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
        <Body size={13} tone="muted">
          Match phone follows your phone&apos;s light or dark setting.
        </Body>
      </View>
      <View style={{ gap: 8 }}>
        <Heading>YOUR SKILL LEVEL</Heading>
        <Body size={13} tone="muted">
          {skill != null ? `You're set to ${skill.toFixed(1)} (${tierOf(skill)}). Tap to change it.` : 'Tap a level to set it.'}
        </Body>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {skillLevels.map((l) => (
            <Chip key={l.value} label={l.value.toFixed(1)} selected={skill === l.value} onPress={() => saveSkill(skill === l.value ? null : l.value)} />
          ))}
        </View>
        {suggested != null ? (
          <Card style={{ padding: 14, gap: 8, borderColor: colors.accentText }}>
            <Body weight="semibold">
              Players who rated you say {suggested.toFixed(1)} ({tierOf(suggested)})
            </Body>
            <Body size={13} tone="muted">
              Based on {summary!.ratings} private {summary!.ratings === 1 ? 'rating' : 'ratings'} from people you&apos;ve played.
            </Body>
            {skill !== suggested ? <Button label={`Use ${suggested.toFixed(1)}`} size="sm" onPress={() => saveSkill(suggested)} /> : null}
          </Card>
        ) : (
          <Body size={13} tone="muted">
            After a few ranked matches, Sickle suggests a level here from what other players rate you.
          </Body>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <Heading>PRIVACY</Heading>
        {showRecord === undefined ? (
          <Body size={13} tone="muted">
            Privacy settings need the newest database update.
          </Body>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Body weight="semibold">Show my record and win rate</Body>
              <Body size={13} tone="muted">
                Others see it on your player page. Court leaderboards always show team records.
              </Body>
            </View>
            <Switch
              accessibilityLabel="Show my record and win rate"
              value={showRecord ?? true}
              disabled={showRecord === null}
              onValueChange={savePrivacy}
              trackColor={{ true: colors.accentFill }}
            />
          </View>
        )}
      </View>

      {profile?.is_admin ? (
        <View style={{ gap: 8 }}>
          <Heading>ADMIN</Heading>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Body weight="semibold">Admin mode</Body>
              <Body size={13} tone="muted">
                {adminMode
                  ? 'On. You see admin tools, like editing and removing courts.'
                  : 'Off. You see Sickle the way players do. Turn it back on any time.'}
              </Body>
            </View>
            <Switch accessibilityLabel="Admin mode" value={adminMode} onValueChange={setAdminMode} trackColor={{ true: colors.accentFill }} />
          </View>
          {adminMode ? (
            <>
              <Link href="/admin/courts" asChild>
                <Button label="Review submitted courts" variant="outline" />
              </Link>
              <Link href="/admin/admins" asChild>
                <Button label="Manage admins" variant="outline" />
              </Link>
            </>
          ) : null}
        </View>
      ) : null}
      <View style={{ gap: 8 }}>
        <Heading>ABOUT</Heading>
        <Link href="/privacy" asChild>
          <Button label="Privacy policy" variant="outline" />
        </Link>
        <Link href="/terms" asChild>
          <Button label="Terms of use" variant="outline" />
        </Link>
      </View>
      {session ? <Button label="Log out" variant="outline" onPress={() => supabase?.auth.signOut()} /> : null}
      {session ? <Button label="Delete my account" variant="dangerOutline" onPress={deleteAccount} /> : null}
    </Screen>
  );
}

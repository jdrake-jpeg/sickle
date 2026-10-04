import { useEffect, useState } from 'react';
import { Alert, Switch, View } from 'react-native';

import { Body, Segmented } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ChallengesFrom, fetchPlaySettings, PlaySettings, savePlaySettings } from '@/lib/play';
import { useProfile } from '@/lib/profile';
import { useTheme } from '@/lib/theme';

// What you're open to: singles and doubles, who can challenge you, and whether
// people can send you friend requests. Saves as you tap. Used on the Play page
// and in Settings.
export function PlayPrefs() {
  const { colors } = useTheme();
  const { demoMode } = useAuth();
  const { profile } = useProfile();
  // undefined while loading, null if the database update isn't there yet.
  const [settings, setSettings] = useState<PlaySettings | null | undefined>(undefined);

  useEffect(() => {
    fetchPlaySettings(demoMode, profile?.id).then(setSettings);
  }, [demoMode, profile?.id]);

  if (settings === undefined) return null;
  if (settings === null) {
    return (
      <Body size={13} tone="muted">
        These settings need the newest database update.
      </Body>
    );
  }

  const change = async (next: Partial<PlaySettings>) => {
    const before = settings;
    setSettings({ ...settings, ...next });
    try {
      if (profile) await savePlaySettings(demoMode, profile.id, next);
    } catch (e) {
      setSettings(before);
      Alert.alert("Couldn't save", e instanceof Error ? e.message : 'Try again.');
    }
  };

  const toggle = (label: string, hint: string, value: boolean, onChange: (v: boolean) => void) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Body weight="semibold">{label}</Body>
        <Body size={13} tone="muted">
          {hint}
        </Body>
      </View>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: colors.accentFill }} />
    </View>
  );

  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 6 }}>
        <Body weight="semibold">Who can challenge you</Body>
        <Segmented<ChallengesFrom>
          value={settings.challenges_from}
          onChange={(v) => change({ challenges_from: v })}
          options={[
            { value: 'everyone', label: 'Everyone' },
            { value: 'friends', label: 'Friends' },
            { value: 'nobody', label: 'Nobody' },
          ]}
        />
        <Body size={13} tone="muted">
          {settings.challenges_from === 'everyone'
            ? 'Anyone can send you a challenge.'
            : settings.challenges_from === 'friends'
              ? 'Only your friends can send you challenges.'
              : 'Paused. Nobody can challenge you until you turn this back on.'}
        </Body>
      </View>
      {toggle('Open to singles', 'Show up when people look for singles players.', settings.plays_singles, (v) => change({ plays_singles: v }))}
      {toggle('Open to doubles', 'Show up when people look for doubles partners and teams.', settings.plays_doubles, (v) => change({ plays_doubles: v }))}
      {toggle('Take friend requests', 'Turn off to stop new friend requests. Friends you already have stay.', settings.friend_requests, (v) => change({ friend_requests: v }))}
    </View>
  );
}

// The short version for the Looking to Play card: what you're looking for and who
// can challenge you. Settings has the full list.
export function LookingFor({ settings, onChange }: { settings: PlaySettings; onChange: (next: Partial<PlaySettings>) => void }) {
  type Kind = 'singles' | 'doubles' | 'both';
  const kind: Kind = settings.plays_singles && settings.plays_doubles ? 'both' : settings.plays_singles ? 'singles' : 'doubles';
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 6 }}>
        <Body size={13} weight="semibold" tone="muted">
          I want to play
        </Body>
        <Segmented<Kind>
          accent
          value={kind}
          onChange={(v) => onChange({ plays_singles: v !== 'doubles', plays_doubles: v !== 'singles' })}
          options={[
            { value: 'singles', label: 'Singles' },
            { value: 'doubles', label: 'Doubles' },
            { value: 'both', label: 'Both' },
          ]}
        />
      </View>
      <View style={{ gap: 6 }}>
        <Body size={13} weight="semibold" tone="muted">
          Who can challenge me
        </Body>
        <Segmented<ChallengesFrom>
          accent
          value={settings.challenges_from}
          onChange={(v) => onChange({ challenges_from: v })}
          options={[
            { value: 'everyone', label: 'Anyone' },
            { value: 'friends', label: 'Friends' },
            { value: 'nobody', label: 'Nobody' },
          ]}
        />
      </View>
    </View>
  );
}

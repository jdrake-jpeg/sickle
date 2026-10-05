import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { TimeField } from '@/components/TimeWheel';
import { Body } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { defaultStart, fetchPreferredTimes, latestStart, PreferredTimes, savePreferredTimes, weekDays, windowText } from '@/lib/preferred';
import { useProfile } from '@/lib/profile';

// A Date whose clock is the given minutes after midnight (the day doesn't matter).
const atMinutes = (minutes: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes);
  return d;
};

// Settings: pick a day, then spin the wheel to the 2 hour window you like that
// day, like 10 to 12 or 7 to 9 PM. Each day can be different. Players see these
// when they challenge you. Saves as you go.
export function PreferredTimesEditor() {
  const { demoMode } = useAuth();
  const { profile } = useProfile();
  const [prefs, setPrefs] = useState<PreferredTimes | null>(null);

  useEffect(() => {
    fetchPreferredTimes(demoMode, profile?.id).then(setPrefs);
  }, [demoMode, profile?.id]);

  if (!prefs) return null;

  const change = async (next: PreferredTimes) => {
    const before = prefs;
    setPrefs(next);
    try {
      if (profile) await savePreferredTimes(demoMode, profile.id, next);
    } catch (e) {
      setPrefs(before);
      Alert.alert("Couldn't save", e instanceof Error ? e.message : 'Try again.');
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={{ gap: 2 }}>
        <Body weight="semibold">Preferred times</Body>
        <Body size={13} tone="muted">
          Tap a day to pick your 2 hour window. Players see these when they challenge you.
        </Body>
      </View>
      {weekDays.map((d) => {
        const start = prefs[d.value];
        return (
          <TimeField
            key={d.value}
            title={`${d.long}, start time`}
            value={atMinutes(start ?? defaultStart)}
            display={start === undefined ? `${d.long}: not set` : `${d.long}: ${windowText(start)}`}
            action={start === undefined ? 'Set' : 'Change'}
            mode="time"
            allowPast
            onChange={(t) => change({ ...prefs, [d.value]: Math.min(latestStart, t.getHours() * 60 + t.getMinutes()) })}
            onClear={
              start === undefined
                ? undefined
                : () => {
                    const next = { ...prefs };
                    delete next[d.value];
                    change(next);
                  }
            }
          />
        );
      })}
      {Object.keys(prefs).length > 0 ? null : (
        <Body size={13} tone="muted">
          Nothing set. Anyone can challenge you for any time.
        </Body>
      )}
    </View>
  );
}

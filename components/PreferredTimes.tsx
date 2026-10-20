import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { TimeField } from '@/components/TimeWheel';
import { Body } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { dayEnd, defaultStart, fetchPreferredTimes, fixWindow, PreferredTimes, savePreferredTimes, timeText, weekDays, windowMinutes } from '@/lib/preferred';
import { useProfile } from '@/lib/profile';

// A Date whose clock is the given minutes after midnight (the day doesn't matter).
const atMinutes = (minutes: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setMinutes(Math.min(minutes, dayEnd - 1));
  return d;
};
const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();

// Settings: pick a day, then pick when you are open from and until, like
// 12 PM to 8 PM. Each day can be different. Players see these when they
// challenge you. Saves as you go.
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
          Tap a day, then pick the time you are open from and until, like 12 PM to 8 PM. Players see these when they challenge you.
        </Body>
      </View>
      {weekDays.map((d) => {
        const w = prefs[d.value];
        if (w === undefined) {
          return (
            <TimeField
              key={d.value}
              title={`${d.long}, open from`}
              value={atMinutes(defaultStart)}
              display={`${d.long}: not set`}
              action="Set"
              mode="time"
              allowPast
              onChange={(t) => change({ ...prefs, [d.value]: fixWindow(minutesOf(t), minutesOf(t) + windowMinutes) })}
            />
          );
        }
        return (
          <View key={d.value} style={{ gap: 6 }}>
            <TimeField
              title={`${d.long}, open from`}
              value={atMinutes(w.start)}
              display={`${d.long}: from ${timeText(w.start)}`}
              mode="time"
              allowPast
              onChange={(t) => change({ ...prefs, [d.value]: fixWindow(minutesOf(t), Math.max(w.end, minutesOf(t) + 30)) })}
              onClear={() => {
                const next = { ...prefs };
                delete next[d.value];
                change(next);
              }}
            />
            <TimeField
              title={`${d.long}, open until`}
              value={atMinutes(w.end)}
              display={`${d.long}: until ${w.end >= dayEnd ? '12:00 AM' : timeText(w.end)}`}
              mode="time"
              allowPast
              onChange={(t) => change({ ...prefs, [d.value]: fixWindow(w.start, minutesOf(t) === 0 ? dayEnd : minutesOf(t)) })}
            />
          </View>
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

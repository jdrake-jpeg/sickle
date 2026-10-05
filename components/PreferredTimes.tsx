import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { Body, Button, Chip } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  defaultStart,
  earliestStart,
  fetchPreferredTimes,
  latestStart,
  noPreferredTimes,
  PreferredTimes,
  savePreferredTimes,
  weekDays,
  windowText,
} from '@/lib/preferred';
import { useProfile } from '@/lib/profile';

// Settings: the days you like to play and one 2 hour window, like 10 to 12 or
// 7 to 9 PM. Players see it when they challenge you. Saves as you tap.
export function PreferredTimesEditor() {
  const { demoMode } = useAuth();
  const { profile } = useProfile();
  const [prefs, setPrefs] = useState<PreferredTimes | null>(null);

  useEffect(() => {
    fetchPreferredTimes(demoMode, profile?.id).then(setPrefs);
  }, [demoMode, profile?.id]);

  if (!prefs) return null;
  const start = prefs.start ?? defaultStart;

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

  const toggleDay = (day: number) => {
    const days = prefs.days.includes(day) ? prefs.days.filter((d) => d !== day) : [...prefs.days, day];
    change({ days, start: days.length > 0 ? start : null });
  };

  const move = (by: number) => change({ days: prefs.days, start: Math.max(earliestStart, Math.min(latestStart, start + by)) });

  return (
    <View style={{ gap: 10 }}>
      <View style={{ gap: 2 }}>
        <Body weight="semibold">Preferred times</Body>
        <Body size={13} tone="muted">
          Players see these when they challenge you.
        </Body>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {weekDays.map((d) => (
          <Chip key={d.value} label={d.label} selected={prefs.days.includes(d.value)} onPress={() => toggleDay(d.value)} />
        ))}
      </View>
      {prefs.days.length > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Button label="Earlier" variant="outline" size="sm" disabled={start <= earliestStart} onPress={() => move(-30)} />
          <Body weight="bold" size={16} style={{ flex: 1, textAlign: 'center' }}>
            {windowText(start)}
          </Body>
          <Button label="Later" variant="outline" size="sm" disabled={start >= latestStart} onPress={() => move(30)} />
        </View>
      ) : (
        <Body size={13} tone="muted">
          Pick the days you like to play.
        </Body>
      )}
      {prefs.days.length > 0 ? <Button label="Clear" variant="ghost" size="sm" onPress={() => change(noPreferredTimes)} /> : null}
    </View>
  );
}

import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { TimeField } from '@/components/TimeWheel';
import { Body, Button, Card, Chip } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { dayEnd, defaultStart, fetchPreferredTimes, minWindow, PreferredTimes, savePreferredTimes, timeText, weekDays, windowMinutes, windowText } from '@/lib/preferred';
import { useProfile } from '@/lib/profile';

// A Date whose clock is the given minutes after midnight (the day doesn't matter).
const atMinutes = (minutes: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setMinutes(Math.min(minutes, dayEnd - 1));
  return d;
};
// 12:00 AM as an end time means the end of the day.
const minutesOf = (d: Date, asEnd = false) => {
  const m = d.getHours() * 60 + d.getMinutes();
  return asEnd && m === 0 ? dayEnd : m;
};
const endText = (m: number) => (m >= dayEnd ? '12:00 AM' : timeText(m));

// Settings: a list of the times you are open, and an Add button. Pick the days,
// a start and an end time, then save. Each day has one stretch of time, so days
// never repeat or overlap. Players see these when they challenge you.
export function PreferredTimesEditor() {
  const { demoMode } = useAuth();
  const { profile } = useProfile();
  const [prefs, setPrefs] = useState<PreferredTimes | null>(null);
  const [adding, setAdding] = useState(false);
  // Editing one day keeps it locked in; adding lets you pick any unused days.
  const [editDay, setEditDay] = useState<number | null>(null);
  const [days, setDays] = useState<number[]>([]);
  const [from, setFrom] = useState(defaultStart);
  const [until, setUntil] = useState(defaultStart + windowMinutes);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchPreferredTimes(demoMode, profile?.id).then(setPrefs);
  }, [demoMode, profile?.id]);

  if (!prefs) return null;

  const used = new Set(Object.keys(prefs).map(Number));
  const freeDays = weekDays.filter((d) => !used.has(d.value));
  const saved = weekDays.filter((d) => used.has(d.value));

  const open = (day: number | null) => {
    setError(null);
    setEditDay(day);
    if (day === null) {
      setDays([]);
      setFrom(defaultStart);
      setUntil(defaultStart + windowMinutes);
    } else {
      setDays([day]);
      setFrom(prefs[day].start);
      setUntil(prefs[day].end);
    }
    setAdding(true);
  };

  const persist = async (next: PreferredTimes) => {
    setBusy(true);
    try {
      if (profile) await savePreferredTimes(demoMode, profile.id, next);
      setPrefs(next);
      return true;
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : 'Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (days.length === 0) return setError('Pick at least one day.');
    if (until - from < minWindow) return setError(`Until has to be at least ${minWindow} minutes after from.`);
    setError(null);
    const next = { ...prefs };
    for (const d of days) next[d] = { start: from, end: until };
    if (await persist(next)) setAdding(false);
  };

  const remove = async (day: number) => {
    const next = { ...prefs };
    delete next[day];
    await persist(next);
  };

  const pickFrom = (t: Date) => {
    const m = minutesOf(t);
    setFrom(m);
    // Keep the end after the start by moving it along when it would fall too close.
    if (until - m < minWindow) setUntil(Math.min(dayEnd, m + windowMinutes));
    setError(null);
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={{ gap: 2 }}>
        <Body weight="semibold">Preferred times</Body>
        <Body size={13} tone="muted">
          List when you like to play, like Monday from 12 PM to 8 PM. Players see these when they challenge you.
        </Body>
      </View>

      {saved.map((d) => (
        <Card key={d.value} style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Body weight="bold">{d.long}</Body>
            <Body size={13} tone="muted">
              {windowText(prefs[d.value])}
            </Body>
          </View>
          <Button label="Edit" variant="outline" size="sm" disabled={busy || adding} onPress={() => open(d.value)} />
          <Button label="Remove" variant="ghost" size="sm" disabled={busy || adding} onPress={() => remove(d.value)} />
        </Card>
      ))}
      {saved.length === 0 && !adding ? (
        <Body size={13} tone="muted">
          Nothing set. Anyone can challenge you for any time.
        </Body>
      ) : null}

      {adding ? (
        <Card style={{ padding: 14, gap: 12 }} highlighted>
          <Body weight="bold">{editDay !== null ? `Change ${weekDays.find((d) => d.value === editDay)?.long}` : 'Which days?'}</Body>
          {editDay === null ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {freeDays.map((d) => (
                <Chip
                  key={d.value}
                  label={d.label}
                  selected={days.includes(d.value)}
                  onPress={() => {
                    setError(null);
                    setDays((cur) => (cur.includes(d.value) ? cur.filter((x) => x !== d.value) : [...cur, d.value]));
                  }}
                />
              ))}
            </View>
          ) : null}
          <TimeField title="Open from" value={atMinutes(from)} display={`From ${timeText(from)}`} mode="time" allowPast onChange={pickFrom} />
          <TimeField
            title="Open until"
            value={atMinutes(until)}
            display={`Until ${endText(until)}`}
            mode="time"
            allowPast
            onChange={(t) => {
              setUntil(minutesOf(t, true));
              setError(null);
            }}
          />
          {error ? (
            <Body size={13} weight="semibold" tone="danger">
              {error}
            </Body>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Cancel" variant="outline" style={{ flex: 1 }} disabled={busy} onPress={() => setAdding(false)} />
            <Button label={busy ? 'Saving…' : 'Yes, save'} style={{ flex: 1 }} disabled={busy} onPress={save} />
          </View>
        </Card>
      ) : freeDays.length > 0 ? (
        <Button label={saved.length === 0 ? 'List your preferred times' : 'Add more times'} variant="outline" onPress={() => open(null)} />
      ) : (
        <Body size={13} tone="muted">
          Every day is set. Edit or remove one to change it.
        </Body>
      )}
    </View>
  );
}

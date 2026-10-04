import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Switch, View } from 'react-native';

import { Body, Button, Card, Heading, InfoDrop } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { Category, categories, disablePush, enablePush, PushStatus, pushStatus } from '@/lib/notifications';
import { useProfile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

type Switches = Record<Category, boolean>;
const allOn: Switches = { challenges: true, teams: true, friends: true, courts: true, messages: true };

// Turn each kind of notification on or off, and allow them on this phone.
export function NotificationSettings() {
  const { colors } = useTheme();
  const { demoMode } = useAuth();
  const { profile } = useProfile();
  // null until loaded; undefined when the database doesn't have notifications yet.
  const [values, setValues] = useState<Switches | null | undefined>(demoMode ? allOn : null);
  const [push, setPush] = useState<PushStatus>('unavailable');

  useEffect(() => {
    pushStatus().then(setPush);
  }, []);

  useEffect(() => {
    if (demoMode || !supabase || !profile) return;
    supabase
      .from('profiles')
      .select(categories.map((c) => c.column).join(', '))
      .eq('id', profile.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) return setValues(undefined);
        const row = data as unknown as Record<string, boolean | null>;
        setValues(Object.fromEntries(categories.map((c) => [c.key, row[c.column] ?? true])) as Switches);
      });
  }, [demoMode, profile]);

  const save = useCallback(
    async (next: Partial<Switches>) => {
      const before = values;
      setValues((v) => ({ ...(v ?? allOn), ...next }));
      if (demoMode || !supabase || !profile) return;
      const update = Object.fromEntries(categories.filter((c) => c.key in next).map((c) => [c.column, next[c.key]]));
      const { error } = await supabase.from('profiles').update(update).eq('id', profile.id);
      if (error) {
        setValues(before);
        Alert.alert("Couldn't save", error.message);
      }
    },
    [values, demoMode, profile],
  );

  const allowPush = async () => {
    const result = await enablePush();
    setPush(result);
    if (result === 'blocked') {
      Alert.alert('Notifications are blocked', 'Turn them on for Sickle in your phone Settings.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]);
    }
  };

  const stopPush = async () => {
    await disablePush();
    setPush('off');
  };

  if (values === undefined) {
    return (
      <Body size={13} tone="muted">
        Notification settings need the newest database update.
      </Body>
    );
  }

  const everyOn = values ? categories.every((c) => values[c.key]) : false;

  return (
    <View style={{ gap: 10 }}>
      <Body size={13} tone="muted">
        Pick what Sickle tells you about. These apply to the alerts inside Sickle and to alerts on your phone.
      </Body>

      {push !== 'unavailable' ? (
        <Card style={{ padding: 14, gap: 8 }} highlighted={push === 'on'}>
          <Heading size={14}>{push === 'on' ? 'ALERTS ON THIS PHONE' : 'ALERTS ON THIS PHONE ARE OFF'}</Heading>
          <Body size={13} tone="muted">
            {push === 'on'
              ? 'You get a notification on this phone for anything you have turned on below.'
              : push === 'blocked'
                ? 'Notifications are blocked for Sickle. Turn them on in your phone Settings.'
                : 'Allow notifications so Sickle can tell you when something happens, even when the app is closed.'}
          </Body>
          {push === 'on' ? (
            <Button label="Stop alerts on this phone" variant="outline" size="sm" onPress={stopPush} />
          ) : (
            <Button label={push === 'blocked' ? 'Open phone Settings' : 'Allow notifications'} size="sm" onPress={push === 'blocked' ? () => Linking.openSettings() : allowPush} />
          )}
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label="Turn all on" variant={everyOn ? 'primary' : 'outline'} size="sm" style={{ flex: 1 }} disabled={!values} onPress={() => save(allOn)} />
        <Button
          label="Turn all off"
          variant="outline"
          size="sm"
          style={{ flex: 1 }}
          disabled={!values}
          onPress={() => save({ challenges: false, teams: false, friends: false, courts: false, messages: false })}
        />
      </View>

      {categories.map((c) => (
        <View key={c.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Body weight="semibold">{c.title}</Body>
            <Body size={13} tone="muted">
              {c.detail}
            </Body>
          </View>
          <Switch
            accessibilityLabel={c.title}
            value={values?.[c.key] ?? true}
            disabled={values === null}
            onValueChange={(on) => save({ [c.key]: on })}
            trackColor={{ true: colors.accentFill }}
          />
        </View>
      ))}

      <InfoDrop title="How do notifications work?">
        Sickle sends one alert when something happens, like a new challenge or a friend request. Every alert is also saved in your Alerts list in the app, so you never miss one. Court condition alerts only come for courts you play at or have challenged at, and at most one per court a day. Turn off a kind here and you stop getting it.
      </InfoDrop>
    </View>
  );
}

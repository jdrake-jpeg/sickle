import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';

import { HelpFooter } from '@/components/HelpFooter';
import { LogoWordmark } from '@/components/Logo';
import { LookingFor } from '@/components/PlayPrefs';
import { ShowMore, usePaged } from '@/components/ShowMore';
import { skillLabel } from '@/components/SkillPicker';
import { Avatar, Body, Button, Card, Heading, ListRow, Screen, SectionHeader, Segmented } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatMiles, initialsOf } from '@/lib/format';
import { getCurrentLocation, getLocationIfAllowed, LatLng, LocationError } from '@/lib/location';
import { useUnreadCount } from '@/lib/notifications';
import { defaultPlaySettings, fetchPlaySettings, formatTags, PlaySettings, savePlaySettings } from '@/lib/play';
import { useProfile } from '@/lib/profile';
import { nearbyPlayers } from '@/lib/sample-data';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

type Duration = '1h' | '2h' | 'tonight';

const durations: { value: Duration; label: string; until: string }[] = [
  { value: '1h', label: '1 hour', until: 'for the next hour' },
  { value: '2h', label: '2 hours', until: 'for the next 2 hours' },
  { value: 'tonight', label: 'Tonight', until: 'until 11:59 PM' },
];

// Players who are looking right now, within this many miles.
const nearbyRadius = 5;

type Player = { id: string; name: string; username: string; skill: number | null; distance: string | null; plays_singles?: boolean; plays_doubles?: boolean };

function endTime(duration: Duration) {
  const now = new Date();
  if (duration === '1h') return new Date(now.getTime() + 60 * 60 * 1000);
  if (duration === '2h') return new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const tonight = new Date(now);
  tonight.setHours(23, 59, 0, 0);
  // Past 11 PM, "tonight" means the next hour.
  return tonight.getTime() - now.getTime() < 60 * 60 * 1000 ? new Date(now.getTime() + 60 * 60 * 1000) : tonight;
}

function showLocationError(error: unknown) {
  if (error instanceof LocationError && error.needsSettings) {
    Alert.alert('Location is off', error.message, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings() },
    ]);
  } else {
    Alert.alert('Location', error instanceof Error ? error.message : 'Something went wrong.');
  }
}

// Play: turn on Looking to Play, say what you want, and see who else is looking
// for the same thing. Searching for people is on the Find people tab.
export default function PlayScreen() {
  const { colors } = useTheme();
  const { demoMode, session } = useAuth();
  const { profile } = useProfile();
  const userId = session?.user.id;
  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [duration, setDuration] = useState<Duration>('2h');
  const [settings, setSettings] = useState<PlaySettings | null>(defaultPlaySettings);
  const [location, setLocation] = useState<LatLng | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const unread = useUnreadCount(!demoMode && Boolean(userId));
  const reloadUnread = unread.reload;

  useFocusEffect(
    useCallback(() => {
      reloadUnread();
    }, [reloadUnread]),
  );

  // Pick up where you left off: are you already looking, and where are you?
  useEffect(() => {
    if (demoMode || !supabase || !userId) return;
    supabase
      .from('profiles')
      .select('availability, availability_expires_at')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.availability === 'looking_to_play' && new Date(data.availability_expires_at) > new Date()) setLooking(true);
      });
    getLocationIfAllowed().then(setLocation);
  }, [demoMode, userId]);

  useEffect(() => {
    fetchPlaySettings(demoMode, profile?.id).then(setSettings);
  }, [demoMode, profile?.id]);

  const changeSettings = async (next: Partial<PlaySettings>) => {
    if (!settings) return;
    const before = settings;
    setSettings({ ...settings, ...next });
    try {
      if (profile) await savePlaySettings(demoMode, profile.id, next);
    } catch (e) {
      setSettings(before);
      Alert.alert("Couldn't save", e instanceof Error ? e.message : 'Try again.');
    }
  };

  // Show people who want what you want: singles, doubles, or either.
  const format = !settings ? null : settings.plays_singles && settings.plays_doubles ? null : settings.plays_singles ? 'singles' : 'doubles';

  const loadNearby = useCallback(async () => {
    if (!supabase || !location) return;
    const args = { p_lat: location.lat, p_lng: location.lng, p_radius_miles: nearbyRadius, p_min_skill: null, p_max_skill: null };
    let res = await supabase.rpc('nearby_players', format ? { ...args, p_format: format } : args);
    // The format filter needs the newer database update; fall back to no filter.
    if (res.error && format) res = await supabase.rpc('nearby_players', args);
    setPlayers(
      (res.data ?? []).map(
        (p: { profile_id: string; display_name: string; username: string; skill_level: number | null; distance_miles: number; plays_singles?: boolean; plays_doubles?: boolean }) => ({
          id: p.profile_id,
          name: p.display_name,
          username: p.username,
          skill: p.skill_level,
          distance: formatMiles(p.distance_miles),
          plays_singles: p.plays_singles,
          plays_doubles: p.plays_doubles,
        }),
      ),
    );
  }, [location, format]);

  useEffect(() => {
    if (!demoMode) loadNearby();
  }, [demoMode, loadNearby]);

  const toggleLooking = async () => {
    if (demoMode || !supabase) {
      setLooking(!looking);
      return;
    }
    setBusy(true);
    try {
      if (looking) {
        const { error } = await supabase.rpc('set_looking_to_play', { p_on: false });
        if (error) throw error;
        setLooking(false);
      } else {
        const here = await getCurrentLocation();
        setLocation(here);
        const { error } = await supabase.rpc('set_looking_to_play', {
          p_on: true,
          p_until: endTime(duration).toISOString(),
          p_lat: here.lat,
          p_lng: here.lng,
        });
        if (error) throw error;
        setLooking(true);
      }
    } catch (error) {
      showLocationError(error);
    } finally {
      setBusy(false);
    }
  };

  const results: Player[] = demoMode
    ? nearbyPlayers.map((p) => ({ id: p.id, name: p.name, username: p.username, skill: p.skill, distance: p.distance }))
    : players;
  const paged = usePaged(results, 5);

  const emptyMessage =
    !demoMode && !location
      ? 'Tap Go to share your rough location and see who else is looking nearby.'
      : 'Nobody nearby is looking for that right now. Check back soon, or find people on the Find people tab.';

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44 }}>
        <LogoWordmark width={130} />
        {demoMode ? null : (
          <Link href="/notifications" asChild>
            <Button label={unread.count > 0 ? `Alerts (${unread.count})` : 'Alerts'} variant={unread.count > 0 ? 'primary' : 'outline'} size="sm" />
          </Link>
        )}
      </View>

      <Card highlighted={looking} style={{ padding: 16, gap: 14, borderRadius: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: looking ? colors.accentFill : colors.borderStrong }} />
              <Heading size={18}>LOOKING TO PLAY</Heading>
            </View>
            <Body size={13} tone="muted">
              {looking ? `On ${durations.find((d) => d.value === duration)!.until}` : 'Off. Tap Go to turn it on'}
            </Body>
          </View>
          <Button
            label={busy ? '…' : looking ? 'Turn off' : 'Go'}
            variant={looking ? 'danger' : 'primary'}
            size="sm"
            disabled={busy}
            onPress={toggleLooking}
          />
        </View>
        <Body size={13} tone="muted">
          {looking
            ? 'You are on. Players nearby can see you and challenge you.'
            : 'Turn this on when you want a game. Players nearby can see you and challenge you.'}
        </Body>
        {settings ? <LookingFor settings={settings} onChange={changeSettings} /> : null}
        {!looking ? <Segmented accent value={duration} onChange={setDuration} options={durations.map(({ value, label }) => ({ value, label }))} /> : null}
      </Card>

      <View style={{ gap: 10 }}>
        <SectionHeader title="Looking for the same" detail={`${results.length} nearby`} />
        {results.length === 0 ? (
          <Card style={{ padding: 16 }}>
            <Body tone="muted">{emptyMessage}</Body>
          </Card>
        ) : (
          paged.shown.map((player) => (
            <Link key={player.id} href={{ pathname: '/player/[id]', params: { id: player.id, distance: player.distance ?? '' } }} asChild>
              <Pressable accessibilityRole="link">
                <ListRow
                  left={<Avatar initials={initialsOf(player.name)} />}
                  title={player.name}
                  subtitle={[`@${player.username}`, skillLabel(player.skill), player.distance, formatTags(player)].filter(Boolean).join(' · ')}
                  right={
                    <Body tone="accent" weight="bold" size={14}>
                      Challenge
                    </Body>
                  }
                />
              </Pressable>
            </Link>
          ))
        )}
        <ShowMore hasMore={paged.hasMore} remaining={paged.remaining} onPress={paged.more} />
      </View>

      <Link href="/friends" asChild>
        <Button label="Find more people to play" variant="outline" />
      </Link>

      <HelpFooter />
    </Screen>
  );
}

import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';

import { LogoWordmark } from '@/components/Logo';
import { SkillGuide, skillLabel } from '@/components/SkillPicker';
import { Avatar, Body, Button, Card, Chip, Field, Heading, ListRow, Screen, SectionHeader, Segmented } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatMiles, initialsOf } from '@/lib/format';
import { getCurrentLocation, getLocationIfAllowed, LatLng, LocationError } from '@/lib/location';
import { nearbyPlayers } from '@/lib/sample-data';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

type Duration = '1h' | '2h' | 'tonight';

const durations: { value: Duration; label: string; until: string }[] = [
  { value: '1h', label: '1 hour', until: 'for the next hour' },
  { value: '2h', label: '2 hours', until: 'for the next 2 hours' },
  { value: 'tonight', label: 'Tonight', until: 'until 11:59 PM' },
];

// Same groups as the skill guide: Beginner 2.0 to 2.5, Intermediate 3.0 to
// 3.5, Pro 4.0 to 4.5, Star 5.0 and up.
const skillRanges: { label: string; min: number | null; max: number | null }[] = [
  { label: 'Any skill', min: null, max: null },
  { label: 'Beginner', min: null, max: 2.99 },
  { label: 'Intermediate', min: 3.0, max: 3.99 },
  { label: 'Pro', min: 4.0, max: 4.99 },
  { label: 'Star', min: 5.0, max: null },
];

const ratingIntro =
  "The number next to a player is their skill rating, from 2.0 (brand new) to 5.5+ (pro level). Players pick their own, on the same scale as DUPR, the rating most pickleball players use. Tap to see what each level looks like.";
const distances = [1, 3, 5];

type Player = { id: string; name: string; username: string; skill: number | null; distance: string | null };

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

export default function PlayScreen() {
  const { colors } = useTheme();
  const { demoMode, session } = useAuth();
  const userId = session?.user.id;
  const [looking, setLooking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [duration, setDuration] = useState<Duration>('2h');
  const [skill, setSkill] = useState(skillRanges[0].label);
  const [distance, setDistance] = useState(3);
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState<LatLng | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);

  const searching = query.trim().length >= 2;
  const q = query.trim().toLowerCase();

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

  const loadNearby = useCallback(async () => {
    if (!supabase || !location) return;
    const range = skillRanges.find((s) => s.label === skill)!;
    const { data } = await supabase.rpc('nearby_players', {
      p_lat: location.lat,
      p_lng: location.lng,
      p_radius_miles: distance,
      p_min_skill: range.min,
      p_max_skill: range.max,
    });
    setPlayers(
      (data ?? []).map((p: { profile_id: string; display_name: string; username: string; skill_level: number | null; distance_miles: number }) => ({
        id: p.profile_id,
        name: p.display_name,
        username: p.username,
        skill: p.skill_level,
        distance: formatMiles(p.distance_miles),
      })),
    );
  }, [location, skill, distance]);

  useEffect(() => {
    if (!demoMode && !searching) loadNearby();
  }, [demoMode, searching, loadNearby]);

  useEffect(() => {
    if (demoMode || !supabase || !searching) return;
    const timer = setTimeout(async () => {
      const { data } = await supabase!.rpc('search_players', { p_query: query.trim() });
      setPlayers(
        (data ?? []).map((p: { profile_id: string; display_name: string; username: string; skill_level: number | null }) => ({
          id: p.profile_id,
          name: p.display_name,
          username: p.username,
          skill: p.skill_level,
          distance: null,
        })),
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [demoMode, searching, query]);

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
    ? (searching ? nearbyPlayers.filter((p) => p.username.includes(q) || p.name.toLowerCase().includes(q)) : nearbyPlayers).map(
        (p) => ({ id: p.id, name: p.name, username: p.username, skill: p.skill, distance: p.distance }),
      )
    : players;

  const emptyMessage = searching
    ? `No player matches "${query.trim()}".`
    : !demoMode && !location
      ? 'Tap Go to share your rough location and see who else is looking nearby.'
      : 'Nobody nearby is looking right now. Turn on Looking to Play so others can find you.';

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44 }}>
        <LogoWordmark width={130} />
        <Link href="/friends" asChild>
          <Button label="Friends" variant="outline" size="sm" />
        </Link>
      </View>

      <Card style={{ padding: 16, gap: 14, borderRadius: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: looking ? colors.accentFill : colors.borderStrong }} />
              <Heading size={18}>{looking ? 'LOOKING TO PLAY' : 'NOT LOOKING'}</Heading>
            </View>
            <Body size={13} tone="muted">
              {looking
                ? `Shown nearby ${durations.find((d) => d.value === duration)!.until}, as a rough distance`
                : 'Nobody nearby can see you'}
            </Body>
          </View>
          <Button
            label={busy ? '…' : looking ? 'Stop' : 'Go'}
            variant={looking ? 'outline' : 'primary'}
            size="sm"
            disabled={busy}
            onPress={toggleLooking}
          />
        </View>
        <Segmented accent value={duration} onChange={setDuration} options={durations.map(({ value, label }) => ({ value, label }))} />
      </Card>

      <Field
        label="Find a player"
        placeholder="Search by username"
        autoCapitalize="none"
        autoCorrect={false}
        value={query}
        onChangeText={setQuery}
        returnKeyType="search"
      />

      {!searching ? (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {skillRanges.map((s) => (
              <Chip key={s.label} label={s.label} selected={s.label === skill} onPress={() => setSkill(s.label)} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {distances.map((d) => (
              <Chip key={d} label={`Within ${d} mi`} selected={d === distance} onPress={() => setDistance(d)} />
            ))}
          </View>
        </View>
      ) : null}

      <SkillGuide title="WHAT DO THE RATINGS MEAN?" intro={ratingIntro} />

      <View style={{ gap: 10 }}>
        <SectionHeader title={searching ? 'Players' : 'Looking to play nearby'} detail={`${results.length} found`} />
        {results.length === 0 ? (
          <Card style={{ padding: 16 }}>
            <Body tone="muted">{emptyMessage}</Body>
          </Card>
        ) : (
          results.map((player) => (
            <Link key={player.id} href={{ pathname: '/player/[id]', params: { id: player.id, distance: player.distance ?? '' } }} asChild>
              <Pressable accessibilityRole="link">
                <ListRow
                  left={<Avatar initials={initialsOf(player.name)} />}
                  title={player.name}
                  subtitle={[`@${player.username}`, skillLabel(player.skill), player.distance].filter(Boolean).join(' · ')}
                  right={<Body tone="accent" weight="bold" size={14}>Team up</Body>}
                />
              </Pressable>
            </Link>
          ))
        )}
      </View>
    </Screen>
  );
}

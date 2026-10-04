import { Link, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { CourtMap } from '@/components/CourtMap';
import { LightsPicker, LightsValue, saveLights } from '@/components/LightsPicker';
import { Body, Button, Chip, Field, ListRow, Screen, Segmented } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { courtMeta, courtsNear, createPrivateCourt, findGoogleCourts, GoogleCourt, useCourts } from '@/lib/courts';
import { formatMiles } from '@/lib/format';
import { useProfile } from '@/lib/profile';
import { getCurrentLocation, LatLng } from '@/lib/location';
import { supabase } from '@/lib/supabase';

type Setting = 'outdoor' | 'indoor';
type Visibility = 'public' | 'private';

type Prefill = { name?: string; lat?: string; lng?: string; address?: string; placeId?: string };

// Anyone can submit a court. It goes on the map once an admin approves it
// (right away when an admin adds it). Opened from a gray Google pin, it starts
// filled in with that court.
export default function NewCourtScreen() {
  const prefill = useLocalSearchParams<Prefill>();
  const prefilledSpot = prefill.lat && prefill.lng ? { lat: Number(prefill.lat), lng: Number(prefill.lng) } : null;
  const { demoMode } = useAuth();
  const { profile } = useProfile();
  const [center, setCenter] = useState<LatLng | null>(prefilledSpot);
  const [pin, setPin] = useState<LatLng | null>(prefilledSpot);
  const [placeId, setPlaceId] = useState<string | null>(prefill.placeId || null);
  const [nearby, setNearby] = useState<GoogleCourt[]>([]);
  const [name, setName] = useState(prefill.name ?? '');
  const [address, setAddress] = useState(prefill.address ?? '');
  const [count, setCount] = useState('');
  const [setting, setSetting] = useState<Setting>('outdoor');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [lights, setLights] = useState<LightsValue>({ has: null, until: null });
  const [here, setHere] = useState<LatLng | null>(null);
  const { courts } = useCourts();
  // Courts already on Sickle within about a mile: pick one instead of adding it again.
  const listedNearby = courtsNear(prefilledSpot ?? here, courts ?? []).filter((c) => c.miles !== null && c.miles < 1).slice(0, 5);

  const locateMe = async () => {
    try {
      const here = await getCurrentLocation();
      setCenter(here);
      movePin(here);
    } catch {
      // No location: they can still tap the map to drop the pin.
    }
  };

  useEffect(() => {
    if (prefilledSpot) return;
    (async () => {
      try {
        const here = await getCurrentLocation();
        setHere(here);
        setCenter(here);
        setPin(here);
        if (!demoMode) setNearby((await findGoogleCourts(here, [])).slice(0, 6));
      } catch {
        // No location: they can still tap the map to drop the pin.
      }
    })();
    // Runs once when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (g: GoogleCourt) => {
    const spot = { lat: g.lat, lng: g.lng };
    setCenter(spot);
    setPin(spot);
    setName(g.name);
    setAddress(g.address ?? '');
    setPlaceId(g.place_id);
  };

  // Moving the pin by hand means it's no longer that Google place.
  const movePin = (spot: LatLng) => {
    setPin(spot);
    setPlaceId(null);
  };

  const courtCount = count.trim() ? Number(count) : null;
  const countOk = courtCount === null || (Number.isInteger(courtCount) && courtCount >= 1 && courtCount <= 50);
  const ready = name.trim().length >= 2 && pin && countOk;

  const submit = async () => {
    if (!pin) return;
    if (demoMode || !supabase) {
      Alert.alert('Demo mode', 'Courts are saved once Supabase is connected.');
      router.back();
      return;
    }
    setBusy(true);
    if (visibility === 'private') {
      try {
        const id = await createPrivateCourt(false, {
          name: name.trim(),
          lat: pin.lat,
          lng: pin.lng,
          address: address.trim() || null,
          court_count: courtCount,
          indoor: setting === 'indoor',
        });
        if (lights.has !== null) await saveLights(false, id, lights).catch(() => {});
        Alert.alert('Saved', 'Your private court is ready. Only you and your friends can see it.');
        router.replace({ pathname: '/court/[id]', params: { id } });
      } catch (e) {
        Alert.alert("Couldn't save the court", e instanceof Error ? e.message : 'Try again.');
      } finally {
        setBusy(false);
      }
      return;
    }
    const { data: courtId, error } = await supabase.rpc('submit_court', {
      p_name: name.trim(),
      p_lat: pin.lat,
      p_lng: pin.lng,
      p_address: address.trim() || null,
      p_court_count: courtCount,
      p_indoor: setting === 'indoor',
      p_note: note.trim() || null,
      p_google_place_id: placeId,
    });
    if (!error && courtId && lights.has !== null) await saveLights(false, courtId as string, lights).catch(() => {});
    setBusy(false);
    if (error) {
      Alert.alert("Couldn't add the court", error.message);
      return;
    }
    if (profile?.is_admin) Alert.alert('Added', "It's on the map now.");
    else Alert.alert('Thanks!', "An admin will check it's a real court. It shows on the map once it's approved.");
    router.back();
  };

  return (
    <Screen>
      {listedNearby.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Body size={13} weight="semibold" tone="muted">
            Already on Sickle near you. Tap one to use it:
          </Body>
          {listedNearby.map((c) => (
            <Link key={c.id} href={{ pathname: '/court/[id]', params: { id: c.id } }} asChild>
              <Pressable accessibilityRole="link">
                <ListRow
                  title={c.name}
                  subtitle={[courtMeta(c), c.miles !== null ? formatMiles(Math.round(c.miles * 10) / 10) : null].filter(Boolean).join(' · ')}
                  right={
                    <Body size={14} weight="bold" tone="accent">
                      Open
                    </Body>
                  }
                />
              </Pressable>
            </Link>
          ))}
          <Body size={13} weight="semibold" tone="muted">
            Not there? Add it below.
          </Body>
        </View>
      ) : null}
      <View style={{ gap: 8 }}>
        <Segmented<Visibility>
          value={visibility}
          onChange={setVisibility}
          options={[
            { value: 'public', label: 'Public court' },
            { value: 'private', label: 'Private (friends)' },
          ]}
        />
        <Body size={13} tone="muted">
          {visibility === 'public'
            ? 'Everyone can find and play here. An admin checks it first, then it goes on the map.'
            : 'Saved right away. Only you and your friends can see it, and it is never sent to an admin. It can\'t be within 200 feet of a public court. Use the public one instead.'}
        </Body>
      </View>
      <Body tone="muted">Put the pin right on the courts. Tap the map or drag the pin to move it.</Body>
      {nearby.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Body size={13} weight="semibold" tone="muted">
            Is it one of these?
          </Body>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {nearby.map((g) => (
              <Chip key={g.place_id} label={g.name} selected={placeId === g.place_id} onPress={() => pick(g)} />
            ))}
          </View>
        </View>
      ) : null}
      <CourtMap height={300} center={center} pin={pin} onPinChange={movePin} showsUserLocation={!prefilledSpot && Boolean(center)} />
      <Button label="Use my location" variant="outline" size="sm" onPress={locateMe} />

      <Field label="Court name" placeholder="Porter Park" value={name} onChangeText={setName} maxLength={60} />
      <Field label="Address or directions (optional)" placeholder="Behind the pool" value={address} onChangeText={setAddress} maxLength={200} />
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Field label="Number of courts" placeholder="4" keyboardType="number-pad" value={count} onChangeText={setCount} maxLength={2} />
        </View>
        <View style={{ flex: 1.4 }}>
          <Segmented<Setting>
            value={setting}
            onChange={setSetting}
            options={[
              { value: 'outdoor', label: 'Outdoor' },
              { value: 'indoor', label: 'Indoor' },
            ]}
          />
        </View>
      </View>
      {!countOk ? (
        <Body size={13} tone="danger">
          Enter a number from 1 to 50.
        </Body>
      ) : null}
      <LightsPicker value={lights} onChange={setLights} />
      {visibility === 'public' ? (
        <Field
          label="Anything the admin should know? (optional)"
          placeholder="Lights until 10, bring your own net"
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={500}
          style={{ height: 88, paddingTop: 12 }}
        />
      ) : null}

      <Button label={busy ? 'Sending…' : visibility === 'private' ? 'Save private court' : profile?.is_admin ? 'Add to the map' : 'Submit for review'} size="lg" disabled={busy || !ready} onPress={submit} />
    </Screen>
  );
}

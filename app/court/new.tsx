import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { CourtMap } from '@/components/CourtMap';
import { Body, Button, Field, Screen, Segmented } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getCurrentLocation, LatLng } from '@/lib/location';
import { supabase } from '@/lib/supabase';

type Setting = 'outdoor' | 'indoor';

// Anyone can submit a court. It goes on the map once an admin approves it.
export default function NewCourtScreen() {
  const { demoMode } = useAuth();
  const [center, setCenter] = useState<LatLng | null>(null);
  const [pin, setPin] = useState<LatLng | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [count, setCount] = useState('');
  const [setting, setSetting] = useState<Setting>('outdoor');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const locateMe = async () => {
    try {
      const here = await getCurrentLocation();
      setCenter(here);
      setPin(here);
    } catch {
      // No location: they can still tap the map to drop the pin.
    }
  };

  useEffect(() => {
    locateMe();
  }, []);

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
    const { error } = await supabase.rpc('submit_court', {
      p_name: name.trim(),
      p_lat: pin.lat,
      p_lng: pin.lng,
      p_address: address.trim() || null,
      p_court_count: courtCount,
      p_indoor: setting === 'indoor',
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (error) {
      Alert.alert("Couldn't add the court", error.message);
      return;
    }
    Alert.alert('Thanks!', "An admin will check it's a real court. It shows on the map once it's approved.");
    router.back();
  };

  return (
    <Screen>
      <Body tone="muted">Put the pin right on the courts. Tap the map or drag the pin to move it.</Body>
      <CourtMap height={300} center={center} pin={pin} onPinChange={setPin} showsUserLocation={Boolean(center)} />
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
      <Field
        label="Anything the admin should know? (optional)"
        placeholder="Lights until 10, bring your own net"
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={500}
        style={{ height: 88, paddingTop: 12 }}
      />

      <Button label={busy ? 'Sending…' : 'Submit for review'} size="lg" disabled={busy || !ready} onPress={submit} />
    </Screen>
  );
}

import { Link, router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, useWindowDimensions, View } from 'react-native';

import { CourtMap } from '@/components/CourtMap';
import { Body, Button, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { addMapCourt, courtMeta, courtsNear, GoogleCourt, useCourts, widerMiles } from '@/lib/courts';
import { getCurrentLocation, getLocationIfAllowed, LatLng } from '@/lib/location';
import { useMappedCourts } from '@/lib/nearby-courts';

// The courts map, as big as the screen. Red pins are Sickle courts, gray pins
// are mapped pickleball courts you can add with one tap.
export default function CourtMapScreen() {
  const { demoMode } = useAuth();
  const { courts, reload } = useCourts();
  const { height } = useWindowDimensions();
  const [here, setHere] = useState<LatLng | null>(null);

  useEffect(() => {
    getLocationIfAllowed().then((spot) => {
      setHere(spot);
    });
  }, []);

  // Courts and mapped courts within 25 miles of you.
  const mapped = useMappedCourts(here, courts, reload, widerMiles);
  const suggestions = mapped.suggestions;
  const inRange = here ? courtsNear(here, courts ?? []).filter((c) => c.miles !== null && c.miles <= widerMiles) : [];

  const allowLocation = async () => {
    try {
      setHere(await getCurrentLocation());
    } catch (e) {
      Alert.alert('Location', e instanceof Error ? e.message : 'Something went wrong.');
    }
  };

  const add = (g: GoogleCourt) =>
    Alert.alert(`Add ${g.name} to Sickle?`, 'It goes live right away, so you can challenge people and play ranked matches there.', [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Add it',
        onPress: async () => {
          try {
            const id = await addMapCourt(demoMode, g);
            await reload();
            mapped.remove(g.place_id);
            router.replace(`/court/${id}`);
          } catch (e) {
            Alert.alert("Couldn't add it", e instanceof Error ? e.message : 'Try again.');
          }
        },
      },
    ]);

  return (
    <Screen scroll={false}>
      <Stack.Screen options={{ title: 'Courts map' }} />
      {here ? null : (
        <View style={{ gap: 10 }}>
          <Body tone="muted">Allow your location to see courts within 25 miles.</Body>
          <Button label="Use my location" onPress={allowLocation} />
        </View>
      )}
      {here ? (
        <CourtMap
          height={Math.max(300, height - 250)}
          center={here}
          showsUserLocation={Boolean(here)}
          courts={inRange.map((c) => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, subtitle: courtMeta(c) }))}
          onCourtPress={(id) => router.push(`/court/${id}`)}
          suggestions={suggestions.map((g) => ({ id: g.place_id, name: g.name, lat: g.lat, lng: g.lng }))}
          onSuggestionPress={(placeId) => {
            const g = suggestions.find((x) => x.place_id === placeId);
            if (g) add(g);
          }}
        />
      ) : null}
      <View style={{ gap: 8 }}>
        <Body size={13} tone="muted">
          Red pins are Sickle courts within 25 miles. Gray pins are mapped courts you can add. Tap a pin, then its name.
        </Body>
        <Link href="/court/new" asChild>
          <Button label="Add a court that isn't on the map" variant="outline" size="sm" />
        </Link>
      </View>
    </Screen>
  );
}

import { Link, router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, useWindowDimensions, View } from 'react-native';

import { CourtMap } from '@/components/CourtMap';
import { Body, Button, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { addMapCourt, courtMeta, findGoogleCourts, GoogleCourt, useCourts } from '@/lib/courts';
import { getLocationIfAllowed, LatLng, rexburg } from '@/lib/location';

// The courts map, as big as the screen. Red pins are Sickle courts, gray pins
// are mapped pickleball courts you can add with one tap.
export default function CourtMapScreen() {
  const { demoMode } = useAuth();
  const { courts, reload } = useCourts();
  const { height } = useWindowDimensions();
  const [here, setHere] = useState<LatLng | null>(null);
  const [located, setLocated] = useState(false);
  const [suggestions, setSuggestions] = useState<GoogleCourt[]>([]);

  useEffect(() => {
    getLocationIfAllowed().then((spot) => {
      setHere(spot);
      setLocated(true);
    });
  }, []);

  useEffect(() => {
    if (demoMode || !courts || !located) return;
    findGoogleCourts(here ?? rexburg, courts).then(setSuggestions);
  }, [demoMode, courts, located, here]);

  const add = (g: GoogleCourt) =>
    Alert.alert(`Add ${g.name} to Sickle?`, 'It goes live right away, so you can challenge people and play ranked matches there.', [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Add it',
        onPress: async () => {
          try {
            const id = await addMapCourt(demoMode, g);
            await reload();
            setSuggestions((list) => list.filter((x) => x.place_id !== g.place_id));
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
      <CourtMap
        height={Math.max(300, height - 250)}
        center={here}
        showsUserLocation={Boolean(here)}
        courts={(courts ?? []).map((c) => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, subtitle: courtMeta(c) }))}
        onCourtPress={(id) => router.push(`/court/${id}`)}
        suggestions={suggestions.map((g) => ({ id: g.place_id, name: g.name, lat: g.lat, lng: g.lng }))}
        onSuggestionPress={(placeId) => {
          const g = suggestions.find((x) => x.place_id === placeId);
          if (g) add(g);
        }}
      />
      <View style={{ gap: 8 }}>
        <Body size={13} tone="muted">
          Red pins are courts on Sickle. Gray pins are mapped pickleball courts that aren&apos;t on Sickle yet. Tap a pin, then its name, to open or add it.
        </Body>
        <Link href="/court/new" asChild>
          <Button label="Add a court that isn't on the map" variant="outline" size="sm" />
        </Link>
      </View>
    </Screen>
  );
}

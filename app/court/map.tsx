import { Link, router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, useWindowDimensions, View } from 'react-native';

import { CourtMap } from '@/components/CourtMap';
import { Body, Button, ListRow, Screen, SearchField } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { addMapCourt, courtMeta, GoogleCourt, searchCourts, useCourts, widerMiles } from '@/lib/courts';
import { getCurrentLocation, getLocationIfAllowed, LatLng } from '@/lib/location';
import { useMappedCourts } from '@/lib/nearby-courts';

// The courts map, as big as the screen. Red pins are every Sickle court, so
// you can pan anywhere. Gray pins are mapped courts within 25 miles of you that
// you can add with one tap. Opened from a court's page, it starts on that court.
export default function CourtMapScreen() {
  const { lat, lng } = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const focused: LatLng | null = lat && lng && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? { lat: Number(lat), lng: Number(lng) } : null;
  const { demoMode } = useAuth();
  const { courts, reload } = useCourts();
  const { height } = useWindowDimensions();
  const [here, setHere] = useState<LatLng | null>(null);
  const [look, setLook] = useState<LatLng | null>(focused);
  const [query, setQuery] = useState('');

  useEffect(() => {
    getLocationIfAllowed().then((spot) => {
      setHere(spot);
    });
  }, []);

  // Courts and mapped courts within 25 miles of you.
  const mapped = useMappedCourts(here, courts, reload, widerMiles);
  const suggestions = mapped.suggestions;
  // Search every court on the map, not just the near ones.
  const results = searchCourts(here, courts ?? [], query).slice(0, 5);

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
      <SearchField label="Find a court on the map" placeholder="Court name or street" value={query} onChangeText={setQuery} />
      {results.map((c) => (
        <Pressable
          key={c.id}
          accessibilityRole="button"
          onPress={() => {
            setLook({ lat: c.lat, lng: c.lng });
            setQuery('');
          }}>
          <ListRow title={c.name} subtitle={[c.address, courtMeta(c)].filter(Boolean).join(' · ')} />
        </Pressable>
      ))}
      <CourtMap
        height={Math.max(260, height - (results.length > 0 ? 250 + results.length * 64 : 340))}
        center={look ?? here}
        showsUserLocation={Boolean(here)}
        courts={(courts ?? []).map((c) => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, subtitle: courtMeta(c) }))}
        onCourtPress={(id) => router.push(`/court/${id}`)}
        suggestions={suggestions.map((g) => ({ id: g.place_id, name: g.name, lat: g.lat, lng: g.lng }))}
        onSuggestionPress={(placeId) => {
          const g = suggestions.find((x) => x.place_id === placeId);
          if (g) add(g);
        }}
      />
      {here ? null : <Button label="Use my location" variant="outline" size="sm" onPress={allowLocation} />}
      <View style={{ gap: 8 }}>
        <Body size={13} tone="muted">
          Red pins are Sickle courts. Gray pins are mapped courts near you that you can add. Tap a pin, then its name.
        </Body>
        <Link href="/court/new" asChild>
          <Button label="Add a court that isn't on the map" variant="outline" size="sm" />
        </Link>
      </View>
    </Screen>
  );
}

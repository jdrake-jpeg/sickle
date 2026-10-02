import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { brand, radius } from '@/constants/theme';
import { LatLng, rexburg } from '@/lib/location';
import { useTheme } from '@/lib/theme';

export type MapCourt = { id: string; name: string; lat: number; lng: number; subtitle?: string };

export type CourtMapProps = {
  courts?: MapCourt[];
  // Where the map starts. Moves there when it changes.
  center?: LatLng | null;
  height?: number;
  onCourtPress?: (id: string) => void;
  // Courts Google knows about that aren't on Sickle yet, shown as gray pins.
  suggestions?: MapCourt[];
  onSuggestionPress?: (id: string) => void;
  // A pin the player places by tapping or dragging, used to submit a court.
  pin?: LatLng | null;
  onPinChange?: (pin: LatLng) => void;
  showsUserLocation?: boolean;
  // Static previews can't be panned or zoomed.
  interactive?: boolean;
};

// Apple Maps on iPhone and Google Maps on Android, through react-native-maps
// (built into Expo Go). Store builds on Android need a Google Maps key; see the README.
export function CourtMap({
  courts = [],
  center,
  height = 220,
  onCourtPress,
  suggestions = [],
  onSuggestionPress,
  pin,
  onPinChange,
  showsUserLocation = false,
  interactive = true,
}: CourtMapProps) {
  const { name, colors } = useTheme();
  const map = useRef<MapView>(null);
  const start = center ?? pin ?? rexburg;
  const delta = interactive ? 0.04 : 0.01;

  useEffect(() => {
    if (center) map.current?.animateToRegion({ latitude: center.lat, longitude: center.lng, latitudeDelta: delta, longitudeDelta: delta }, 400);
  }, [center, delta]);

  const placePin = (coordinate: { latitude: number; longitude: number }) =>
    onPinChange?.({ lat: coordinate.latitude, lng: coordinate.longitude });

  return (
    <View style={{ height, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
      <MapView
        ref={map}
        style={{ flex: 1 }}
        initialRegion={{ latitude: start.lat, longitude: start.lng, latitudeDelta: delta, longitudeDelta: delta }}
        userInterfaceStyle={name}
        showsUserLocation={showsUserLocation}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        onPress={onPinChange ? (e) => placePin(e.nativeEvent.coordinate) : undefined}>
        {courts.map((court) => (
          <Marker
            key={court.id}
            coordinate={{ latitude: court.lat, longitude: court.lng }}
            title={court.name}
            description={court.subtitle}
            pinColor={brand.sickleRed}
            onCalloutPress={onCourtPress ? () => onCourtPress(court.id) : undefined}
          />
        ))}
        {suggestions.map((court) => (
          <Marker
            key={`g-${court.id}`}
            coordinate={{ latitude: court.lat, longitude: court.lng }}
            title={court.name}
            description={court.subtitle ?? 'Not on Sickle yet. Tap to add it.'}
            pinColor="#8A8A8A"
            onCalloutPress={onSuggestionPress ? () => onSuggestionPress(court.id) : undefined}
          />
        ))}
        {pin ? (
          <Marker
            coordinate={{ latitude: pin.lat, longitude: pin.lng }}
            pinColor={brand.pickleGreen}
            draggable={Boolean(onPinChange)}
            onDragEnd={(e) => placePin(e.nativeEvent.coordinate)}
          />
        ) : null}
      </MapView>
    </View>
  );
}

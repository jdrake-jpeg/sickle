import * as Location from 'expo-location';

export type LatLng = { lat: number; lng: number };

// Rexburg, used to center maps when we don't know where the player is.
export const rexburg: LatLng = { lat: 43.826, lng: -111.789 };

export class LocationError extends Error {
  // True when the player said no and has to change it in their phone's Settings.
  constructor(message: string, readonly needsSettings = false) {
    super(message);
  }
}

// Asks for permission if needed, then returns where the phone is right now.
// Only rough location is needed: the database rounds it to about 1 km.
export async function getCurrentLocation(): Promise<LatLng> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    throw new LocationError(
      permission.canAskAgain
        ? 'Sickle needs your location to show you to players nearby.'
        : 'Location is off for this app. Turn it on in Settings to find players nearby.',
      !permission.canAskAgain,
    );
  }
  try {
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch {
    const last = await Location.getLastKnownPositionAsync();
    if (last) return { lat: last.coords.latitude, lng: last.coords.longitude };
    throw new LocationError("Couldn't find your location. Check that Location Services are on.");
  }
}

// Without asking: the location if the player already allowed it, else null.
export async function getLocationIfAllowed(): Promise<LatLng | null> {
  const permission = await Location.getForegroundPermissionsAsync();
  if (!permission.granted) return null;
  try {
    const last = await Location.getLastKnownPositionAsync();
    if (last) return { lat: last.coords.latitude, lng: last.coords.longitude };
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch {
    return null;
  }
}

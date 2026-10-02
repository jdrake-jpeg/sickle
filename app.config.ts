import type { ConfigContext, ExpoConfig } from 'expo/config';

// Adds settings that come from environment variables on top of app.json.
// GOOGLE_MAPS_ANDROID_API_KEY is only needed for Android store builds: Expo Go
// brings its own key, and iPhones use Apple Maps. Keep the key out of git; set
// it as an EAS environment variable instead.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  plugins: [
    ...(config.plugins ?? []),
    ['react-native-maps', { androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY }],
  ],
});

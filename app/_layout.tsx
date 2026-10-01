import { Barlow_400Regular, Barlow_500Medium, Barlow_600SemiBold, Barlow_700Bold } from '@expo-google-fonts/barlow';
import { Saira_800ExtraBold, Saira_800ExtraBold_Italic, Saira_900Black_Italic } from '@expo-google-fonts/saira';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { SickleThemeProvider, useTheme } from '@/lib/theme';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Saira_800ExtraBold,
    Saira_800ExtraBold_Italic,
    Saira_900Black_Italic,
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
    Barlow_700Bold,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <SickleThemeProvider>
      <RootLayoutNav />
    </SickleThemeProvider>
  );
}

function RootLayoutNav() {
  const { name, colors } = useTheme();
  const base = name === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.accentText,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.border,
      notification: colors.danger,
    },
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShadowVisible: false, headerTintColor: colors.text }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="match/[id]" options={{ title: 'Confirm result' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings', presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}

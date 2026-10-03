import { Barlow_400Regular, Barlow_500Medium, Barlow_600SemiBold, Barlow_700Bold } from '@expo-google-fonts/barlow';
import { Saira_800ExtraBold, Saira_800ExtraBold_Italic, Saira_900Black_Italic } from '@expo-google-fonts/saira';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { fonts } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ProfileProvider, useProfile } from '@/lib/profile';
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
    <AuthProvider>
      <ProfileProvider>
        <SickleThemeProvider>
          <RootLayoutNav />
        </SickleThemeProvider>
      </ProfileProvider>
    </AuthProvider>
  );
}

function RootLayoutNav() {
  const { name, colors } = useTheme();
  const { ready, session, demoMode } = useAuth();
  const profile = useProfile();
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

  if (!ready || (session && !profile.ready)) return null;
  // With Supabase connected, signed-out players only see the sign-in screen,
  // and new players set up a profile before anything else.
  const signedIn = demoMode || Boolean(session);
  const hasProfile = Boolean(profile.profile);

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{ headerShadowVisible: false, headerTintColor: colors.text, headerTitleStyle: { fontFamily: fonts.bodyBold } }}>
        <Stack.Protected guard={signedIn && hasProfile}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="match/[id]" options={{ title: 'Match' }} />
          <Stack.Screen name="score/[challengeId]" options={{ title: 'Enter score' }} />
          <Stack.Screen name="court/[id]" options={{ title: 'Court' }} />
          <Stack.Screen name="court/new" options={{ title: 'Add a court' }} />
          <Stack.Screen name="friends/index" options={{ title: 'Friends' }} />
          <Stack.Screen name="friends/[id]" options={{ title: 'Friend' }} />
          <Stack.Screen name="challenge/new" options={{ title: 'Send a challenge' }} />
          <Stack.Screen name="ratings" options={{ title: 'Your private ratings' }} />
          <Stack.Screen name="profile-edit" options={{ title: 'Edit profile' }} />
          <Stack.Screen name="rules" options={{ title: 'Pickleball rules' }} />
          <Stack.Screen name="team/new" options={{ title: 'New team' }} />
          <Stack.Screen name="admin/courts" options={{ title: 'Review courts' }} />
          <Stack.Screen name="admin/admins" options={{ title: 'Manage admins' }} />
          <Stack.Screen name="player/[id]" options={{ title: 'Player' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings', presentation: 'modal' }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !hasProfile}>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
        {/* Open to everyone, signed in or not. */}
        <Stack.Screen name="privacy" options={{ title: 'Privacy policy' }} />
        <Stack.Screen name="terms" options={{ title: 'Terms of use' }} />
      </Stack>
    </ThemeProvider>
  );
}

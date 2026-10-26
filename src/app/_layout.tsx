import { Archivo_400Regular, Archivo_600SemiBold, Archivo_700Bold } from '@expo-google-fonts/archivo';
import { ArchivoNarrow_500Medium, ArchivoNarrow_600SemiBold } from '@expo-google-fonts/archivo-narrow';
import { PermanentMarker_400Regular } from '@expo-google-fonts/permanent-marker';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useBackendSync } from '../backend/runtime';
import { useLiveTicker } from '../live/useLive';
import { useNotifications } from '../notify/useNotify';
import { ThemeProvider, useTheme } from '../theme/theme';

SplashScreen.preventAutoHideAsync();

function Shell() {
  const { c } = useTheme();
  // The simulated evening keeps its clock across screens, so the ticker lives here, not on one screen.
  useLiveTicker();
  // The backend (sign-in, uploads, outbox) runs for the whole app, next to the clock.
  useBackendSync();
  // Local notifications for this phone's profile (CC-12). Nothing is announced on the dashboard phone.
  useNotifications();
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.ground }, animation: 'fade' }} />
    </>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    Archivo_400Regular, Archivo_600SemiBold, Archivo_700Bold,
    ArchivoNarrow_500Medium, ArchivoNarrow_600SemiBold, PermanentMarker_400Regular,
  });
  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);
  if (!loaded) return null;
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Shell />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

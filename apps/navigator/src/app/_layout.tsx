import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '../components/error-boundary';
import { Mark } from '../components/icon';
import { installCrashReporting, reportError } from '../lib/crash';
import { setFeedbackPrefs } from '../lib/feedback';
import { PrefsProvider, usePrefs, useTheme } from '../theme';

installCrashReporting();

function Shell() {
  const theme = useTheme();
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  // Never wait on fonts forever: after 4 s continue with the system font.
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (loaded || error) return;
    const t = setTimeout(() => {
      setGaveUp(true);
      reportError(new Error('Fonts did not load within 4 s'), 'fonts');
    }, 4000);
    return () => clearTimeout(t);
  }, [loaded, error]);
  if (!loaded && !error && !gaveUp)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#0B1220',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Mark size={72} />
      </View>
    );
  return (
    <>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.c.background },
          animation: 'default',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="venue/[id]" options={{ animation: 'fade' }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        <Stack.Screen name="beacons/[id]" />
        <Stack.Screen
          name="scan"
          options={{ presentation: 'fullScreenModal', animation: 'fade' }}
        />
      </Stack>
    </>
  );
}

/** Keeps voice and vibration in step with the visitor's settings. */
function FeedbackPrefs() {
  const { prefs } = usePrefs();
  useEffect(
    () => setFeedbackPrefs({ voice: prefs.voice, haptics: prefs.haptics }),
    [prefs.voice, prefs.haptics],
  );
  return null;
}

export default function Layout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PrefsProvider>
          <FeedbackPrefs />
          <ErrorBoundary>
            <Shell />
          </ErrorBoundary>
        </PrefsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

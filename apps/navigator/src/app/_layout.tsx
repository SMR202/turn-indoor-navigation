import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Mark } from '../components/icon';
import { PrefsProvider, useTheme } from '../theme';

function Shell() {
  const theme = useTheme();
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  if (!loaded && !error)
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

export default function Layout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PrefsProvider>
          <Shell />
        </PrefsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

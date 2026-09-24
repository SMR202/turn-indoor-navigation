import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#f6f7f2' },
        headerTintColor: '#183d34',
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: 'TURN / Explore indoors' }}
      />
    </Stack>
  );
}

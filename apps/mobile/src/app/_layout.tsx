import { Tabs } from 'expo-router';
import '../global.css';
import { Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavIcon, theme } from '../components/ui';

export default function Layout() {
  return (
    <>
      <StatusBar style="dark" />
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: theme.background },
          headerShadowVisible: false,
          headerTitleAlign: 'left',
          headerTitle: () => (
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}
            >
              <NavIcon name="navigate" color={theme.primary} />
              <Text
                style={{
                  color: theme.ink,
                  fontSize: 22,
                  fontWeight: '800',
                  letterSpacing: 3,
                }}
              >
                TURN
              </Text>
            </View>
          ),
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.muted,
          tabBarStyle: {
            backgroundColor: theme.surface,
            borderTopColor: theme.border,
          },
          tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
          sceneStyle: { backgroundColor: theme.background },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Navigate',
            tabBarIcon: ({ color }) => (
              <NavIcon name="navigate" color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="survey"
          options={{
            title: 'Survey',
            tabBarIcon: ({ color }) => <NavIcon name="survey" color={color} />,
          }}
        />
        <Tabs.Screen
          name="beacon"
          options={{
            title: 'Beacons',
            tabBarIcon: ({ color }) => <NavIcon name="beacon" color={color} />,
          }}
        />
        <Tabs.Screen
          name="classic"
          options={{ href: null, title: 'Classic' }}
        />
        <Tabs.Screen
          name="tests"
          options={{
            title: 'Tests',
            tabBarIcon: ({ color }) => <NavIcon name="tests" color={color} />,
          }}
        />
      </Tabs>
    </>
  );
}

import Constants from 'expo-constants';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiBase } from '../lib/api';
import { Icon } from '../components/icon';
import { Divider, IconButton, T, Tap } from '../components/ui';
import { usePrefs, useTheme } from '../theme';

export default function Settings() {
  const { c } = useTheme();
  const { prefs, setPrefs } = usePrefs();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 20,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <T v="title">Settings</T>
        <IconButton
          icon="close"
          label="Close"
          tone="sunken"
          size={38}
          onPress={() => router.back()}
        />
      </View>
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          paddingBottom: insets.bottom + 40,
          gap: 22,
        }}
      >
        <Group title="Appearance">
          <View
            style={{
              flexDirection: 'row',
              padding: 4,
              gap: 4,
              backgroundColor: c.sunken,
              borderRadius: 14,
              margin: 12,
            }}
          >
            {(['system', 'light', 'dark'] as const).map((t) => (
              <Tap
                key={t}
                onPress={() => setPrefs({ theme: t })}
                style={{
                  flex: 1,
                  height: 38,
                  borderRadius: 11,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor:
                    prefs.theme === t ? c.surface : 'transparent',
                }}
              >
                <T
                  v="caption"
                  weight="600"
                  color={prefs.theme === t ? c.text : c.textMuted}
                >
                  {t === 'system'
                    ? 'Automatic'
                    : t === 'light'
                      ? 'Light'
                      : 'Dark'}
                </T>
              </Tap>
            ))}
          </View>
        </Group>
        <Group title="Routes">
          <Row
            icon="accessible"
            title="Step-free routes"
            detail="Avoid stairs and escalators where the venue marks a step-free path."
            value={prefs.stepFree}
            onChange={(v) => setPrefs({ stepFree: v })}
          />
        </Group>
        <Group title="Privacy">
          <Row
            icon="share"
            title="Share anonymous usage"
            detail="Searches, routes started and arrivals (random id per launch), plus which venue beacons your phone hears during live guidance, help venues keep signs, maps and beacons working. Never your position."
            value={prefs.shareUsage}
            onChange={(v) => setPrefs({ shareUsage: v })}
          />
          <Divider inset={56} />
          <Info
            icon="lock"
            title="Position stays on this phone"
            detail="TURN computes where you are on the device and does not upload location traces."
          />
        </Group>
        <Group title="About">
          <Info
            icon="navigate"
            title={`TURN ${Constants.expoConfig?.version ?? ''}`}
            detail={`Venue server: ${apiBase() ?? 'not configured'}`}
          />
          <Divider inset={56} />
          <Tap
            onPress={() => setPrefs({ onboarded: false })}
            style={{
              padding: 16,
              flexDirection: 'row',
              gap: 14,
              alignItems: 'center',
            }}
          >
            <Icon name="play" size={20} color={c.accent} />
            <T v="callout" color={c.accent} weight="600">
              Show the introduction again
            </T>
          </Tap>
        </Group>
      </ScrollView>
    </View>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <T
        v="micro"
        color={c.textSubtle}
        style={{ textTransform: 'uppercase', marginLeft: 4 }}
      >
        {title}
      </T>
      <View
        style={{
          backgroundColor: c.surface,
          borderRadius: 18,
          overflow: 'hidden',
        }}
      >
        {children}
      </View>
    </View>
  );
}

function Row({
  icon,
  title,
  detail,
  value,
  onChange,
}: {
  icon: string;
  title: string;
  detail: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const { c } = useTheme();
  return (
    <View
      style={{
        padding: 16,
        flexDirection: 'row',
        gap: 14,
        alignItems: 'center',
      }}
    >
      <Icon name={icon} size={22} color={c.textMuted} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="callout" weight="600">
          {title}
        </T>
        <T v="caption" color={c.textMuted}>
          {detail}
        </T>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: c.accent, false: c.lineStrong }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

function Info({
  icon,
  title,
  detail,
}: {
  icon: string;
  title: string;
  detail: string;
}) {
  const { c } = useTheme();
  return (
    <View
      style={{
        padding: 16,
        flexDirection: 'row',
        gap: 14,
        alignItems: 'center',
      }}
    >
      <Icon name={icon} size={22} color={c.textMuted} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="callout" weight="600">
          {title}
        </T>
        <T v="caption" color={c.textMuted}>
          {detail}
        </T>
      </View>
    </View>
  );
}

import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  bundledDemo,
  useCatalog,
  useVenue,
  type VenueSummary,
} from '../lib/api';
import { Icon, Mark } from '../components/icon';
import { Button, IconButton, T, Tap, useProgress } from '../components/ui';
import { VenueThumb } from '../map/VenueThumb';
import { F, shadow, usePrefs, useTheme } from '../theme';

export default function Home() {
  const { prefs } = usePrefs();
  return prefs.onboarded ? <Venues /> : <Onboarding />;
}

const pages = [
  {
    title: 'Find your way inside.',
    body: 'Search a venue, pick a place and follow a clear route — through halls, shops and floors.',
  },
  {
    title: 'Your position stays on your phone.',
    body: 'TURN works out where you are from motion and nearby venue beacons, on the device. No account and no location history.',
  },
  {
    title: 'Start at a TURN code.',
    body: 'Scan a TURN code at the entrance or on a sign to open the venue map and start from exactly where you stand.',
  },
];

function Onboarding() {
  const { setPrefs } = usePrefs();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const scroller = useRef<ScrollView>(null);
  const draw = useProgress('mark', 1100, 250);
  const last = page === pages.length - 1;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#0B1220',
        paddingTop: insets.top,
        paddingBottom: insets.bottom + 16,
      }}
    >
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Mark size={112} tile="#0B1220" progress={draw} />
        <Animated.View entering={FadeIn.delay(900).duration(500)}>
          <T
            v="micro"
            color="#A3AAB6"
            style={{ letterSpacing: 4, marginTop: 14 }}
          >
            TURN
          </T>
        </Animated.View>
      </View>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) =>
          setPage(Math.round(e.nativeEvent.contentOffset.x / width))
        }
        onScroll={
          Platform.OS === 'web'
            ? (e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))
            : undefined
        }
        scrollEventThrottle={32}
        style={{ flexGrow: 0 }}
      >
        {pages.map((p) => (
          <View key={p.title} style={{ width, paddingHorizontal: 28, gap: 12 }}>
            <T v="title" color="#F2F1EE">
              {p.title}
            </T>
            <T v="body" color="#B9BFCA">
              {p.body}
            </T>
          </View>
        ))}
      </ScrollView>
      <View
        style={{
          flexDirection: 'row',
          gap: 6,
          paddingHorizontal: 28,
          marginTop: 26,
          marginBottom: 22,
        }}
      >
        {pages.map((_, i) => (
          <Dot key={i} active={i === page} />
        ))}
      </View>
      <View style={{ paddingHorizontal: 20 }}>
        <Button
          label={last ? 'Get started' : 'Continue'}
          onPress={() => {
            if (last) setPrefs({ onboarded: true });
            else {
              scroller.current?.scrollTo({
                x: (page + 1) * width,
                animated: true,
              });
              setPage(page + 1);
            }
          }}
        />
      </View>
    </View>
  );
}

function Dot({ active }: { active: boolean }) {
  const w = useSharedValue(active ? 22 : 7);
  useEffect(() => {
    w.value = withTiming(active ? 22 : 7, { duration: 260 });
  }, [active, w]);
  const a = useAnimatedStyle(() => ({ width: w.value }));
  return (
    <Animated.View
      style={[
        {
          height: 7,
          borderRadius: 4,
          backgroundColor: active ? '#F2F1EE' : '#3A4456',
        },
        a,
      ]}
    />
  );
}

function Venues() {
  const { c, dark, map } = useTheme();
  const insets = useSafeAreaInsets();
  const [refresh, setRefresh] = useState(0);
  const catalog = useCatalog(refresh);
  const { width } = useWindowDimensions();
  const cardW = Math.min(width, 640) - 40;
  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 32,
          alignItems: 'center',
        }}
        refreshControl={
          <RefreshControl
            refreshing={catalog.loading && refresh > 0}
            onRefresh={() => setRefresh((r) => r + 1)}
          />
        }
      >
        <View style={{ width: cardW }}>
          <Animated.View
            entering={FadeIn.duration(400)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: 48,
            }}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
            >
              <Mark size={30} tile={c.text} stroke={c.background} />
              <T v="callout" weight="600" style={{ letterSpacing: 3.2 }}>
                TURN
              </T>
            </View>
            <IconButton
              icon="sliders"
              label="Settings"
              tone="sunken"
              size={40}
              onPress={() => router.push('/settings')}
            />
          </Animated.View>
          <Animated.View
            entering={FadeInDown.delay(60).duration(450)}
            style={{ marginTop: 26, gap: 6 }}
          >
            <T v="display">Where are you{'\n'}going today?</T>
            <T v="body" color={c.textMuted}>
              Indoor maps and step-by-step directions for the places you visit.
            </T>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(140).duration(450)}>
            <Tap
              onPress={() => router.push('/scan')}
              style={[
                {
                  marginTop: 22,
                  borderRadius: 20,
                  backgroundColor: c.text,
                  padding: 18,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                },
                shadow('floating', dark),
              ]}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: c.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="qr" size={22} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <T v="callout" weight="600" color={c.background}>
                  Scan a TURN code
                </T>
                <T v="caption" color={dark ? '#3A4456' : '#A3AAB6'}>
                  Opens the venue and starts from where you stand
                </T>
              </View>
              <Icon
                name="forward"
                size={18}
                color={dark ? '#3A4456' : '#A3AAB6'}
              />
            </Tap>
          </Animated.View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginTop: 30,
              marginBottom: 12,
            }}
          >
            <T v="headline">Venues</T>
            <T v="caption" color={catalog.online ? c.success : c.textSubtle}>
              {catalog.loading
                ? 'Checking…'
                : catalog.online
                  ? '● Up to date'
                  : 'Offline · saved venues'}
            </T>
          </View>
          <View style={{ gap: 14 }}>
            {catalog.venues.map((v, i) => (
              <Animated.View
                key={v.id}
                entering={FadeInDown.delay(200 + i * 70).duration(450)}
              >
                <VenueCard venue={v} width={cardW} palette={map} />
              </Animated.View>
            ))}
          </View>
          <T v="caption" color={c.textSubtle} center style={{ marginTop: 28 }}>
            TURN · indoor navigation
          </T>
        </View>
      </ScrollView>
    </View>
  );
}

function VenueCard({
  venue,
  width,
  palette,
}: {
  venue: VenueSummary;
  width: number;
  palette: ReturnType<typeof useTheme>['map'];
}) {
  const { c, dark } = useTheme();
  // Downloads (and caches) the published package so the card can show a real miniature.
  const state = useVenue(venue.id);
  const pkg = state.status === 'ready' ? state.bundle.pkg : null;
  return (
    <Tap
      scaleTo={0.985}
      onPress={() =>
        router.push({ pathname: '/venue/[id]', params: { id: venue.id } })
      }
      style={[
        { borderRadius: 22, backgroundColor: c.surface, overflow: 'hidden' },
        shadow('card', dark),
      ]}
    >
      <View
        style={{
          height: 148,
          backgroundColor: palette.land,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {pkg ? (
          <VenueThumb pkg={pkg} palette={palette} width={width} height={148} />
        ) : (
          <Icon name="building" size={34} color={c.textSubtle} stroke={1.6} />
        )}
        <View
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            flexDirection: 'row',
            gap: 6,
          }}
        >
          {venue.private && <Tag icon="lock" text="Private · local network" />}
          {venue.id === bundledDemo.summary.id && (
            <Tag icon="sun" text="Demo venue" />
          )}
        </View>
      </View>
      <View
        style={{
          padding: 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <T v="callout" weight="600" lines={1}>
            {venue.name}
          </T>
          <T v="caption" color={c.textMuted} lines={1}>
            {[
              venue.address,
              `${venue.places} places`,
              venue.floors > 1 ? `${venue.floors} floors` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </T>
        </View>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: c.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="forward" size={17} color={c.accent} stroke={2.4} />
        </View>
      </View>
    </Tap>
  );
}

function Tag({ icon, text }: { icon: string; text: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: 'rgba(11,18,32,0.78)',
        borderRadius: 999,
        paddingHorizontal: 9,
        height: 24,
      }}
    >
      <Icon name={icon} size={12} color="#FFFFFF" stroke={2.2} />
      <T
        v="caption"
        weight="600"
        color="#FFFFFF"
        style={{ fontSize: 11.5, fontFamily: F.semibold }}
      >
        {text}
      </T>
    </View>
  );
}

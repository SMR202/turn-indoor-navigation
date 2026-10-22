import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { P } from '@turn/map-scene';
import type { DotSnapshot, LiveDot } from '../lib/live-dot';
import { shadow, useTheme } from '../theme';
import { Icon } from './icon';
import { Badge, Button, T, Tap } from './ui';

export type RoomChoice = {
  roomId: string;
  name: string;
  centre: P;
  radius: number;
  /** Share of TURN's belief (0–1), when TURN considered this room at all. */
  probability?: number;
};

/**
 * "Your location": what TURN believes (room and accuracy) and a one-tap way to put it right: pick
 * the room from the likeliest few (or all), listen to the beacons again, or point on the map.
 * Every answer becomes a labelled example the venue learns from.
 */
export function WhereAmISheet({
  belief,
  rooms,
  sigma,
  canLocate,
  onRoom,
  onFindAgain,
  onPointOnMap,
  onClose,
}: {
  /** Likeliest rooms first. */
  belief: RoomChoice[];
  /** Every room of the floor, for "Another room". */
  rooms: RoomChoice[];
  sigma: number | null;
  canLocate: boolean;
  onRoom: (room: RoomChoice) => void;
  onFindAgain: () => void;
  onPointOnMap: () => void;
  onClose: () => void;
}) {
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const [all, setAll] = useState(false);
  const top = belief[0];
  const likely = belief.filter((r) => (r.probability ?? 0) >= 0.05).slice(0, 3);
  const list = all
    ? [...rooms].sort((a, b) => a.name.localeCompare(b.name))
    : likely;
  return (
    <View
      style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
    >
      <Animated.View
        entering={FadeIn.duration(180)}
        exiting={FadeOut.duration(160)}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          backgroundColor: 'rgba(11,18,32,0.28)',
        }}
      >
        <Pressable
          accessibilityLabel="Close"
          style={{ flex: 1 }}
          onPress={onClose}
        />
      </Animated.View>
      <Animated.View
        entering={FadeInDown.duration(260)}
        exiting={FadeOutDown.duration(200)}
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            maxHeight: '78%',
            paddingTop: 10,
            paddingBottom: insets.bottom + 14,
            paddingHorizontal: 20,
            backgroundColor: c.surface,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            gap: 14,
          },
          shadow('sheet', dark),
        ]}
      >
        <View
          style={{
            alignSelf: 'center',
            width: 36,
            height: 5,
            borderRadius: 3,
            backgroundColor: c.line,
          }}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Badge icon="locate" color={c.accent} size={40} />
          <View style={{ flex: 1 }}>
            <T v="caption" color={c.textSubtle}>
              Your location
            </T>
            <T v="title" lines={1}>
              {top ? top.name : 'Not sure yet'}
            </T>
            {sigma !== null && (
              <T v="caption" color={c.textMuted}>
                {sigma <= 2
                  ? `Accurate to about ${Math.round(sigma)} m`
                  : `Rough, within about ${Math.round(sigma)} m`}
              </T>
            )}
          </View>
        </View>
        <T v="callout" weight="600">
          {all ? 'Which room are you in?' : 'Not right? Where are you?'}
        </T>
        <ScrollView
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ gap: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {list.map((r, i) => (
            <Tap
              key={r.roomId}
              onPress={() => onRoom(r)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderRadius: 16,
                backgroundColor: !all && i === 0 ? c.accentSoft : c.sunken,
              }}
            >
              <Icon
                name="door"
                size={18}
                color={!all && i === 0 ? c.accent : c.textMuted}
              />
              <T v="callout" weight="600" style={{ flex: 1 }} lines={1}>
                {r.name}
              </T>
              {!all && r.probability !== undefined && (
                <T v="caption" color={c.textMuted}>
                  {i === 0 ? 'TURN thinks here' : 'possible'}
                </T>
              )}
            </Tap>
          ))}
          {!all && (
            <Tap
              onPress={() => setAll(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderRadius: 16,
                backgroundColor: c.sunken,
              }}
            >
              <Icon name="more" size={18} color={c.textMuted} />
              <T v="callout" weight="600">
                Another room
              </T>
            </Tap>
          )}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {canLocate && (
            <Button
              label="Find me again"
              icon="beacon"
              kind="secondary"
              size="md"
              grow
              onPress={onFindAgain}
            />
          )}
          <Button
            label="Point on map"
            icon="pin"
            kind="secondary"
            size="md"
            grow
            onPress={onPointOnMap}
          />
        </View>
      </Animated.View>
    </View>
  );
}

/**
 * Shown under the search bar while live tracking is rough: the accuracy, and a tap to fix it.
 * Watches the dot itself, so the venue screen does not re-render with every move.
 */
export function RoughLocationChip({
  dot,
  onPress,
  maxWidth,
}: {
  dot: LiveDot;
  onPress: () => void;
  maxWidth: number;
}) {
  const { c, dark } = useTheme();
  const [snap, setSnap] = useState<DotSnapshot>(() => dot.snapshot());
  useEffect(() => dot.watch(setSnap), [dot]);
  if (!snap.visible || !snap.live || snap.sigma < 2.5) return null;
  return (
    <Animated.View
      entering={FadeIn.duration(250)}
      exiting={FadeOut.duration(200)}
    >
      <Tap
        onPress={onPress}
        accessibilityLabel="Location is rough. Tap to fix it."
        style={[
          {
            alignSelf: 'center',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 14,
            paddingVertical: 7,
            minHeight: 34,
            maxWidth,
            borderRadius: 17,
            backgroundColor: c.surface,
          },
          shadow('floating', dark),
        ]}
      >
        <Icon name="locate" size={14} color={c.warning} />
        <T v="caption" weight="600" lines={1}>
          {`Location rough · ±${Math.round(snap.sigma)} m`}
        </T>
        <T v="caption" weight="700" color={c.accent}>
          Fix
        </T>
      </Tap>
    </Animated.View>
  );
}

/** After a correction: a light "is this right?" check that offers the sheet again. */
export function ConfirmLocationToast({
  label,
  bottom,
  onYes,
  onNo,
}: {
  label: string;
  bottom: number;
  onYes: () => void;
  onNo: () => void;
}) {
  const { c, dark } = useTheme();
  // Silence counts as yes after a while; the walker has moved on.
  useEffect(() => {
    const t = setTimeout(onYes, 9000);
    return () => clearTimeout(t);
  }, [onYes]);
  return (
    <Animated.View
      entering={FadeInDown.duration(260)}
      exiting={FadeOut.duration(200)}
      style={[
        {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingLeft: 16,
          paddingRight: 8,
          paddingVertical: 8,
          borderRadius: 20,
          backgroundColor: c.text,
        },
        shadow('floating', dark),
      ]}
    >
      <T
        v="callout"
        weight="600"
        color={c.background}
        style={{ flex: 1 }}
        lines={2}
      >
        {label} · Is this right?
      </T>
      <Tap
        onPress={onNo}
        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 }}
      >
        <T v="callout" weight="600" color={c.background}>
          No
        </T>
      </Tap>
      <Tap
        onPress={onYes}
        style={{
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 14,
          backgroundColor: c.accent,
        }}
      >
        <T v="callout" weight="700" color="#FFFFFF">
          Yes
        </T>
      </Tap>
    </Animated.View>
  );
}

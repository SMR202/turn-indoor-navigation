import { useEffect, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { motion } from '@turn/design';
import { shadow, useTheme } from '../theme';

/**
 * Draggable bottom sheet with snap points (visible heights in px, ascending). Below the top snap the
 * whole sheet drags; at the top the body scrolls and the header still drags it down.
 */
export function Sheet({
  snaps,
  index,
  onIndex,
  header,
  children,
  bottomInset,
}: {
  snaps: number[];
  index: number;
  onIndex: (i: number) => void;
  header?: ReactNode;
  children?: ReactNode;
  bottomInset: number;
}) {
  const { c, dark } = useTheme();
  const full = snaps[snaps.length - 1]!;
  const offset = (i: number) =>
    full - snaps[Math.max(0, Math.min(snaps.length - 1, i))]!;
  const y = useSharedValue(offset(index));
  const start = useSharedValue(0);
  useEffect(() => {
    y.value = withSpring(offset(index), motion.spring.sheet);
  }, [index, snaps.join(',')]);
  const offsets = snaps.map((_, i) => offset(i));
  const config: Parameters<typeof usePanGesture>[0] = {
    activeOffsetY: [-6, 6],
    onBegin: () => {
      'worklet';
      start.value = y.value;
    },
    onUpdate: (e) => {
      'worklet';
      const max = offsets[0]!;
      const next = start.value + e.translationY;
      // Rubber-band past the ends.
      y.value =
        next < 0 ? next * 0.25 : next > max ? max + (next - max) * 0.25 : next;
    },
    onDeactivate: (e) => {
      'worklet';
      const projected = y.value + e.velocityY * 0.12;
      let best = 0;
      for (let i = 1; i < offsets.length; i++)
        if (
          Math.abs(offsets[i]! - projected) <
          Math.abs(offsets[best]! - projected)
        )
          best = i;
      y.value = withSpring(offsets[best]!, {
        ...motion.spring.sheet,
        velocity: e.velocityY,
      });
      scheduleOnRN(onIndex, best);
    },
  };
  // A gesture object attaches to one detector, so the header and the body each get their own.
  const pan = usePanGesture(config);
  const bodyPan = usePanGesture(config);
  const a = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const atTop = index === snaps.length - 1;
  const body = (
    <ScrollView
      scrollEnabled={atTop}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: bottomInset + 24 }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: -40,
          height: full + 40,
          paddingBottom: 40,
          backgroundColor: c.surface,
          borderTopLeftRadius: 26,
          borderTopRightRadius: 26,
        },
        shadow('sheet', dark),
        a,
      ]}
    >
      <GestureDetector gesture={pan}>
        <View>
          <View
            style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 6 }}
          >
            <View
              style={{
                width: 38,
                height: 5,
                borderRadius: 3,
                backgroundColor: c.lineStrong,
              }}
            />
          </View>
          {header}
        </View>
      </GestureDetector>
      {atTop ? (
        body
      ) : (
        <GestureDetector gesture={bodyPan}>
          <View style={{ flex: 1 }}>{body}</View>
        </GestureDetector>
      )}
    </Animated.View>
  );
}

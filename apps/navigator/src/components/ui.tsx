import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { motion, type as typeScale } from '@turn/design';
import { F, shadow, useTheme } from '../theme';
import { Icon } from './icon';

type Variant = keyof typeof typeScale;
const weightFont: Record<string, string> = {
  '400': F.regular,
  '500': F.medium,
  '600': F.semibold,
  '700': F.bold,
};

/** Text in the TURN type scale (Inter). */
export function T({
  v = 'body',
  color,
  weight,
  style,
  children,
  lines,
  center,
}: {
  v?: Variant;
  color?: string;
  weight?: '400' | '500' | '600' | '700';
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  lines?: number;
  center?: boolean;
}) {
  const { c } = useTheme();
  const s = typeScale[v];
  return (
    <Text
      numberOfLines={lines}
      style={[
        {
          fontFamily: weightFont[weight ?? s.weight],
          fontSize: s.size,
          lineHeight: s.line,
          letterSpacing: s.tracking,
          color: color ?? c.text,
          textAlign: center ? 'center' : undefined,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable that gives a soft spring "press-in" so every control feels physical. */
export function Tap({
  style,
  scaleTo = 0.97,
  children,
  ...rest
}: Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  children?: ReactNode;
}) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        s.value = withSpring(scaleTo, motion.spring.pop);
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.value = withSpring(1, motion.spring.pop);
        rest.onPressOut?.(e);
      }}
      style={[style, a]}
    >
      {children}
    </AnimatedPressable>
  );
}

export function Button({
  label,
  icon,
  onPress,
  kind = 'primary',
  size = 'lg',
  disabled,
  style,
  grow,
}: {
  label: string;
  icon?: string;
  onPress?: () => void;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  grow?: boolean;
}) {
  const { c } = useTheme();
  const bg =
    kind === 'primary'
      ? c.accent
      : kind === 'secondary'
        ? c.sunken
        : kind === 'danger'
          ? c.dangerSoft
          : 'transparent';
  const fg =
    kind === 'primary'
      ? c.onAccent
      : kind === 'danger'
        ? c.danger
        : kind === 'secondary'
          ? c.text
          : c.accent;
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[
        {
          height: size === 'lg' ? 52 : 42,
          paddingHorizontal: size === 'lg' ? 20 : 14,
          borderRadius: 999,
          backgroundColor: bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: disabled ? 0.45 : 1,
          flexGrow: grow ? 1 : 0,
        },
        style,
      ]}
    >
      {icon && (
        <Icon
          name={icon}
          size={size === 'lg' ? 19 : 17}
          color={fg}
          stroke={2.2}
        />
      )}
      <T v="callout" weight="600" color={fg}>
        {label}
      </T>
    </Tap>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  size = 44,
  tone = 'surface',
  style,
  active,
}: {
  icon: string;
  onPress?: () => void;
  label: string;
  size?: number;
  tone?: 'surface' | 'sunken' | 'accent';
  style?: StyleProp<ViewStyle>;
  active?: boolean;
}) {
  const { c, dark } = useTheme();
  const bg =
    tone === 'accent' || active
      ? c.accent
      : tone === 'sunken'
        ? c.sunken
        : c.surface;
  const fg = tone === 'accent' || active ? c.onAccent : c.text;
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      scaleTo={0.92}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        tone === 'surface' ? shadow('floating', dark) : null,
        style,
      ]}
    >
      <Icon
        name={icon}
        size={Math.round(size * 0.45)}
        color={fg}
        stroke={2.1}
      />
    </Tap>
  );
}

export function Chip({
  label,
  icon,
  iconColor,
  onPress,
  selected,
  floating,
}: {
  label: string;
  icon?: string;
  iconColor?: string;
  onPress?: () => void;
  selected?: boolean;
  floating?: boolean;
}) {
  const { c, dark } = useTheme();
  return (
    <Tap
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        {
          height: 36,
          paddingHorizontal: 13,
          borderRadius: 999,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: selected ? c.text : c.surface,
          borderWidth: floating ? 0 : 1,
          borderColor: c.line,
        },
        floating ? shadow('card', dark) : null,
      ]}
    >
      {icon && (
        <Icon
          name={icon}
          size={16}
          color={selected ? c.background : (iconColor ?? c.textMuted)}
          stroke={2.1}
        />
      )}
      <T v="caption" weight="600" color={selected ? c.background : c.text}>
        {label}
      </T>
    </Tap>
  );
}

/** Round category badge (colour + glyph) used in lists, labels and pins. */
export function Badge({
  icon,
  color,
  size = 32,
}: {
  icon: string;
  color: string;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon
        name={icon}
        size={Math.round(size * 0.56)}
        color="#FFFFFF"
        stroke={2.2}
      />
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const { c } = useTheme();
  return (
    <View style={{ height: 1, backgroundColor: c.line, marginLeft: inset }} />
  );
}

/** 0 → 1 over `duration` ms with ease-out, restarting whenever `key` changes (JS-driven, tiny trees only). */
export function useProgress(key: unknown, duration = 700, delay = 0) {
  const [p, setP] = useState(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    setP(0);
    const start = Date.now() + delay;
    const tick = () => {
      const t = Math.min(1, Math.max(0, (Date.now() - start) / duration));
      setP(1 - Math.pow(1 - t, 3));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [key, duration, delay]);
  return p;
}

/** Fades and lifts children in on mount; `delay` staggers lists. */
export function Rise({
  delay = 0,
  children,
  style,
}: {
  delay?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const v = useSharedValue(0);
  useEffect(() => {
    const t = setTimeout(
      () => (v.value = withTiming(1, { duration: motion.duration.slow })),
      delay,
    );
    return () => clearTimeout(t);
  }, [delay, v]);
  const a = useAnimatedStyle(() => ({
    opacity: v.value,
    transform: [{ translateY: (1 - v.value) * 14 }],
  }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

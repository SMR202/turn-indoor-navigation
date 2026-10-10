import { useState, type PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ColorValue,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';

export const theme = {
  ink: '#14283F',
  muted: '#53667A',
  primary: '#245CE5',
  background: '#F2F5FA',
  surface: '#FFFFFF',
  border: '#D7E0EC',
  tint: '#E8EFFF',
  success: '#12705B',
  warning: '#81530C',
  danger: '#AF303B',
  disabled: '#E1E7EF',
};
export const ui = StyleSheet.create({
  page: {
    padding: 20,
    paddingBottom: 30,
    gap: 18,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
  },
  card: {
    padding: 20,
    borderRadius: 22,
    backgroundColor: theme.surface,
    gap: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
    letterSpacing: -1,
    color: theme.ink,
  },
  heading: {
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '700',
    color: theme.ink,
  },
  body: { fontSize: 15, lineHeight: 23, color: theme.muted },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.8,
    color: theme.primary,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 14,
    padding: 14,
    backgroundColor: theme.surface,
    color: theme.ink,
    fontSize: 16,
  },
});
export function Action({
  title,
  onPress,
  disabled = false,
  primary = false,
  selected = false,
  busy = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  selected?: boolean;
  busy?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, selected, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => ({
        minHeight: 50,
        paddingHorizontal: 16,
        paddingVertical: 13,
        borderRadius: 14,
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: focused
          ? theme.ink
          : selected
            ? theme.primary
            : 'transparent',
        backgroundColor: disabled
          ? theme.disabled
          : primary
            ? theme.primary
            : selected
              ? theme.tint
              : theme.background,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <View style={{ ...ui.row, justifyContent: 'center' }}>
        {busy && (
          <ActivityIndicator color={primary ? theme.surface : theme.primary} />
        )}
        <Text
          style={{
            color: primary && !disabled ? theme.surface : theme.ink,
            fontSize: 15,
            fontWeight: '600',
            textAlign: 'center',
          }}
        >
          {title}
        </Text>
      </View>
    </Pressable>
  );
}
export function Notice({
  children,
  error = false,
}: PropsWithChildren<{ error?: boolean }>) {
  return (
    <View
      style={{
        padding: 14,
        borderRadius: 14,
        backgroundColor: error ? '#FFF0F1' : theme.tint,
      }}
    >
      <Text
        accessibilityRole={error ? 'alert' : undefined}
        accessibilityLiveRegion="polite"
        style={{ ...ui.body, color: error ? theme.danger : theme.ink }}
      >
        {children}
      </Text>
    </View>
  );
}
export function Section({
  title,
  children,
  initiallyOpen = false,
}: PropsWithChildren<{ title: string; initiallyOpen?: boolean }>) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View style={ui.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={{ ...ui.row, minHeight: 44, justifyContent: 'space-between' }}
      >
        <Text style={ui.heading}>{title}</Text>
        <Text style={{ color: theme.primary, fontSize: 24 }}>
          {open ? '−' : '+'}
        </Text>
      </Pressable>
      {open && children}
    </View>
  );
}
export function NavIcon({
  name,
  color,
}: {
  name: 'navigate' | 'survey' | 'tests';
  color: ColorValue;
}) {
  return (
    <Svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
    >
      {name === 'navigate' ? (
        <Path d="M20 4L14 20L10 14L4 10L20 4Z" strokeLinejoin="round" />
      ) : name === 'survey' ? (
        <>
          <Circle cx={12} cy={12} r={3} />
          <Path
            d="M8 3H3V8M16 3H21V8M3 16V21H8M21 16V21H16"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <Path d="M5 19V13M12 19V5M19 19V9" strokeLinecap="round" />
          <Path d="M3 22H21" />
        </>
      )}
    </Svg>
  );
}
export const dataFont = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

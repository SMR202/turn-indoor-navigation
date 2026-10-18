/**
 * TURN design tokens (Plan 003 F1). One source for the app (React Native) and the web console.
 * Minimal and mature: warm neutrals, one accent, status colours only for state.
 */

export const palette = {
  ink: '#0B1220',
  ink800: '#1C2433',
  ink600: '#3A4456',
  ink400: '#7A8394',
  ink300: '#A3AAB6',
  line: '#E5E1DA',
  lineStrong: '#D3CDC3',
  paper: '#F6F4F0',
  surface: '#FFFFFF',
  sunken: '#EFECE6',
  accent: '#2F5AF2',
  accentPressed: '#2447CC',
  accentSoft: '#E8EDFE',
  success: '#1F8A5B',
  successSoft: '#E3F2EA',
  warning: '#B7791F',
  warningSoft: '#FBF0DC',
  danger: '#C2412D',
  dangerSoft: '#FAE6E2',
} as const;

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceRaised: string;
  sunken: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  line: string;
  lineStrong: string;
  accent: string;
  accentPressed: string;
  accentSoft: string;
  onAccent: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  scrim: string;
};

export const lightColors: ThemeColors = {
  background: palette.paper,
  surface: palette.surface,
  surfaceRaised: palette.surface,
  sunken: palette.sunken,
  text: palette.ink,
  textMuted: palette.ink600,
  textSubtle: palette.ink400,
  line: palette.line,
  lineStrong: palette.lineStrong,
  accent: palette.accent,
  accentPressed: palette.accentPressed,
  accentSoft: palette.accentSoft,
  onAccent: '#FFFFFF',
  success: palette.success,
  successSoft: palette.successSoft,
  warning: palette.warning,
  warningSoft: palette.warningSoft,
  danger: palette.danger,
  dangerSoft: palette.dangerSoft,
  scrim: 'rgba(11,18,32,0.42)',
};

export const darkColors: ThemeColors = {
  background: '#0B0F17',
  surface: '#141A25',
  surfaceRaised: '#1B2230',
  sunken: '#0F141D',
  text: '#F2F1EE',
  textMuted: '#B9BFCA',
  textSubtle: '#808898',
  line: '#262E3C',
  lineStrong: '#343D4D',
  accent: '#4064F0',
  accentPressed: '#3554D6',
  accentSoft: '#1D2846',
  onAccent: '#FFFFFF',
  success: '#3FB27F',
  successSoft: '#13291F',
  warning: '#D9A441',
  warningSoft: '#2E2414',
  danger: '#E2664F',
  dangerSoft: '#311A16',
  scrim: 'rgba(0,0,0,0.55)',
};

/** Map palette: reads like a building, not boxes. Warm land, white rooms, soft extruded walls. */
export type MapPalette = {
  land: string;
  room: string;
  roomSelected: string;
  circulation: string;
  outdoor: string;
  stairs: string;
  fixture: string;
  extrusion: string;
  wall: string;
  window: string;
  door: string;
  label: string;
  labelHalo: string;
  labelMuted: string;
  route: string;
  routeCasing: string;
  routeWalked: string;
  dot: string;
  dotHalo: string;
  dotRing: string;
  pin: string;
  beacon: string;
};
export const lightMap: MapPalette = {
  land: '#ECE8E1',
  room: '#FFFFFF',
  roomSelected: '#E8EDFE',
  circulation: '#F8F6F2',
  outdoor: '#DFE8D5',
  stairs: '#EEE8DC',
  fixture: '#F1EEE8',
  extrusion: '#D9D3C9',
  wall: '#BCB4A7',
  window: '#9DBAD6',
  door: '#FFFFFF',
  label: '#3A4456',
  labelHalo: '#FFFFFF',
  labelMuted: '#7A8394',
  route: palette.accent,
  routeCasing: '#FFFFFF',
  routeWalked: '#A9B6E8',
  dot: palette.accent,
  dotHalo: 'rgba(47,90,242,0.14)',
  dotRing: '#FFFFFF',
  pin: '#0B1220',
  beacon: '#6E56CF',
};
export const darkMap: MapPalette = {
  land: '#0E131C',
  room: '#1A2130',
  roomSelected: '#22305A',
  circulation: '#161C28',
  outdoor: '#14211A',
  stairs: '#1F2633',
  fixture: '#1C2230',
  extrusion: '#0A0E15',
  wall: '#3A4354',
  window: '#355A7D',
  door: '#1A2130',
  label: '#C9CED8',
  labelHalo: '#0E131C',
  labelMuted: '#808898',
  route: '#5B7DFF',
  routeCasing: '#0E131C',
  routeWalked: '#3A4A80',
  dot: '#5B7DFF',
  dotHalo: 'rgba(91,125,255,0.18)',
  dotRing: '#FFFFFF',
  pin: '#F2F1EE',
  beacon: '#9A86F0',
};

export const fonts = {
  /** Families loaded by the apps (Inter, SIL Open Font License). */
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  web: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
} as const;

/** Type scale (px / pt). Line heights are absolute for predictable layout. */
export const type = {
  display: { size: 34, line: 40, weight: '700', tracking: -0.8 },
  title: { size: 26, line: 32, weight: '700', tracking: -0.5 },
  headline: { size: 20, line: 26, weight: '600', tracking: -0.3 },
  body: { size: 16, line: 23, weight: '400', tracking: -0.1 },
  callout: { size: 15, line: 21, weight: '500', tracking: -0.1 },
  caption: { size: 13, line: 18, weight: '500', tracking: 0 },
  micro: { size: 11, line: 14, weight: '600', tracking: 0.6 },
} as const;

export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;
export const radius = { sm: 8, md: 12, lg: 18, xl: 26, pill: 999 } as const;

export const elevation = {
  /** CSS box-shadow equivalents; React Native maps them to shadow props. */
  card: { y: 2, blur: 10, opacity: 0.06 },
  sheet: { y: -4, blur: 24, opacity: 0.1 },
  floating: { y: 6, blur: 18, opacity: 0.14 },
} as const;

export const motion = {
  duration: { instant: 90, fast: 160, base: 240, slow: 360, deliberate: 520 },
  /** cubic-bezier control points. */
  easing: {
    standard: [0.2, 0, 0, 1] as const,
    decelerate: [0, 0, 0, 1] as const,
    accelerate: [0.3, 0, 1, 1] as const,
  },
  spring: {
    sheet: { damping: 22, stiffness: 220, mass: 0.9 },
    camera: { damping: 26, stiffness: 140, mass: 1 },
    pop: { damping: 14, stiffness: 260, mass: 0.7 },
  },
  /** Blue-dot halo breathing period in ms. */
  pulseMs: 2200,
} as const;

/** Place categories with a display name and an icon key shared by app and console. */
export const placeCategories = {
  room: { label: 'Rooms', icon: 'door' },
  circulation: { label: 'Corridors', icon: 'footprints' },
  restroom: { label: 'Restrooms', icon: 'restroom' },
  food: { label: 'Food & drink', icon: 'coffee' },
  shop: { label: 'Shops', icon: 'bag' },
  service: { label: 'Services', icon: 'info' },
  health: { label: 'Health', icon: 'cross' },
  exit: { label: 'Exits', icon: 'exit' },
  stairs: { label: 'Stairs & lifts', icon: 'stairs' },
  meeting: { label: 'Meeting rooms', icon: 'users' },
  desk: { label: 'Desks', icon: 'desk' },
  outdoor: { label: 'Outdoors', icon: 'tree' },
  parking: { label: 'Parking', icon: 'car' },
  other: { label: 'Other', icon: 'pin' },
} as const;
export type PlaceCategory = keyof typeof placeCategories;
/** Muted category hues for small icon badges only (never large fills), legible on light and dark. */
export const categoryColors: Record<PlaceCategory, string> = {
  room: '#6E7787',
  circulation: '#6E7787',
  restroom: '#3D7AB8',
  food: '#C0662A',
  shop: '#8256C2',
  service: '#2F5AF2',
  health: '#C2412D',
  exit: '#1F8A5B',
  stairs: '#566782',
  meeting: '#24857F',
  desk: '#6A7A35',
  outdoor: '#4A8A3A',
  parking: '#4A5A78',
  other: '#6E7787',
};
export function normaliseCategory(raw: string | undefined): PlaceCategory {
  const k = (raw ?? '').toLowerCase();
  if (k in placeCategories) return k as PlaceCategory;
  if (/bath|toilet|wc|rest ?room|powder/.test(k)) return 'restroom';
  if (/food|drink|cafe|café|kitchen|dining|restaurant/.test(k)) return 'food';
  if (/^store( ?room)?$|storage|utility|laundry/.test(k)) return 'room';
  if (/shop|store|retail|boutique/.test(k)) return 'shop';
  if (/stair|lift|elevator|escalator/.test(k)) return 'stairs';
  if (/exit|entrance|lobby|door/.test(k)) return 'exit';
  if (/meet|conference/.test(k)) return 'meeting';
  if (/health|clinic|pharmacy|first aid/.test(k)) return 'health';
  if (/service|info|desk|library|reception/.test(k)) return 'service';
  if (/outdoor|lawn|garden|porch/.test(k)) return 'outdoor';
  if (/park/.test(k)) return 'parking';
  if (/corridor|passage|hall|circulation/.test(k)) return 'circulation';
  return k ? 'room' : 'other';
}

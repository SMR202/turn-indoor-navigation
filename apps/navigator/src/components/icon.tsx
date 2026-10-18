import { memo } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { MARK_PATHS } from '@turn/design';
import { ICON_PATHS } from '@turn/map-scene';

/** Interface glyphs on the same 24-unit, 2-stroke grid as the category icons. */
const UI: Record<string, string[]> = {
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z', 'M20 20l-4-4'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  back: ['M15 5l-7 7 7 7'],
  forward: ['M9 5l7 7-7 7'],
  down: ['M6 9l6 6 6-6'],
  up: ['M6 15l6-6 6 6'],
  locate: [
    'M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z',
    'M12 2v3',
    'M12 19v3',
    'M2 12h3',
    'M19 12h3',
    'M12 12h.01',
  ],
  sliders: ['M4 7h10', 'M18 7h2', 'M16 5v4', 'M4 17h4', 'M12 17h8', 'M10 15v4'],
  bookmark: ['M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1Z'],
  share: [
    'M12 15V3',
    'M7 8l5-5 5 5',
    'M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6',
  ],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 7v5l3 2'],
  accessible: ['M11 4.5h.01', 'M11 8v6h5l2 5', 'M8 10.5A5.5 5.5 0 1 0 15 18'],
  qr: [
    'M4 4h6v6H4Z',
    'M14 4h6v6h-6Z',
    'M4 14h6v6H4Z',
    'M14 14h2',
    'M18 14h2v2',
    'M14 18h2v2',
    'M18 20h2',
    'M18 18h.01',
  ],
  swap: ['M8 4v16', 'M4 8l4-4 4 4', 'M16 20V4', 'M12 16l4 4 4-4'],
  walk: [
    'M13 4.5h.01',
    'M10 21l2-6 3 3v3',
    'M12 15l1-6-3 1-2 3',
    'M13 9l2 3 3 1',
  ],
  check: ['M5 12.5l4.5 4.5L19 7'],
  play: ['M8 5.5v13l10.5-6.5Z'],
  layers: ['M12 3l9 5-9 5-9-5 9-5Z', 'M3 13l9 5 9-5'],
  offline: [
    'M3 3l18 18',
    'M8.5 16.5a5 5 0 0 1 7 0',
    'M5 12.6a10 10 0 0 1 5.2-2.5',
    'M2 9a15 15 0 0 1 4.4-2.6',
    'M12 20h.01',
  ],
  navigate: ['M12 3l7 18-7-4-7 4 7-18Z'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  building: [
    'M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16',
    'M15 9h4a1 1 0 0 1 1 1v11',
    'M3 21h18',
    'M8 8h3',
    'M8 12h3',
    'M8 16h3',
  ],
  beacon: [
    'M12 12h.01',
    'M8.5 8.5a5 5 0 0 0 0 7',
    'M15.5 8.5a5 5 0 0 1 0 7',
    'M5.6 5.6a9 9 0 0 0 0 12.8',
    'M18.4 5.6a9 9 0 0 1 0 12.8',
  ],
  flag: ['M5 21V4', 'M5 4h11l-2 4 2 4H5'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  lock: ['M6 11h12v9H6Z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3'],
  sun: [
    'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    'M12 2v2',
    'M12 20v2',
    'M4.9 4.9l1.4 1.4',
    'M17.7 17.7l1.4 1.4',
    'M2 12h2',
    'M20 12h2',
    'M4.9 19.1l1.4-1.4',
    'M17.7 6.3l1.4-1.4',
  ],
  // Manoeuvres
  'turn-straight': ['M12 20V5', 'M6 11l6-6 6 6'],
  'turn-left': ['M17 20v-7a4 4 0 0 0-4-4H5', 'M9 5L5 9l4 4'],
  'turn-right': ['M7 20v-7a4 4 0 0 1 4-4h8', 'M15 5l4 4-4 4'],
  'turn-slight-left': ['M16 20v-6l-7-7', 'M9 12V7h5'],
  'turn-slight-right': ['M8 20v-6l7-7', 'M15 12V7h-5'],
  'turn-u': ['M8 20V10a4 4 0 0 1 8 0v4', 'M12 11l4 4 4-4'],
  'turn-arrive': [
    'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z',
    'M12 9.5h.01',
  ],
};

export type IconName = keyof typeof UI | keyof typeof ICON_PATHS;

export const Icon = memo(function Icon({
  name,
  size = 20,
  color,
  stroke = 2,
  fill,
}: {
  name: string;
  size?: number;
  color: string;
  stroke?: number;
  fill?: string;
}) {
  const paths = UI[name] ?? ICON_PATHS[name] ?? ICON_PATHS.pin ?? [];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {paths.map((d, i) => (
        <Path
          key={i}
          d={d}
          fill={
            name === 'play' || name === 'navigate' ? (fill ?? color) : 'none'
          }
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
});

/** The TURN mark. `progress` draws the route stroke from the dot (0 → 1) for the launch animation. */
export function Mark({
  size = 40,
  tile = '#0B1220',
  stroke = '#FFFFFF',
  dot = '#2F5AF2',
  progress = 1,
  bare = false,
}: {
  size?: number;
  tile?: string;
  stroke?: string;
  dot?: string;
  progress?: number;
  bare?: boolean;
}) {
  const routeLength = 16 + 12.6 + 13; // straight + quarter curve + straight on the 64 grid
  const arrowLength = 20;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      {!bare && (
        <Path
          d="M16 0h32a16 16 0 0 1 16 16v32a16 16 0 0 1-16 16H16A16 16 0 0 1 0 48V16A16 16 0 0 1 16 0Z"
          fill={tile}
        />
      )}
      <Path
        d={MARK_PATHS.route}
        fill="none"
        stroke={stroke}
        strokeWidth={5.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={[routeLength, routeLength]}
        strokeDashoffset={routeLength * (1 - Math.min(1, p / 0.75))}
      />
      <Path
        d={MARK_PATHS.arrow}
        fill="none"
        stroke={stroke}
        strokeWidth={5.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={[arrowLength, arrowLength]}
        strokeDashoffset={arrowLength * (1 - Math.max(0, (p - 0.7) / 0.3))}
      />
      <Circle
        cx={MARK_PATHS.dot.cx}
        cy={MARK_PATHS.dot.cy}
        r={MARK_PATHS.dot.r}
        fill={dot}
        stroke={bare ? 'none' : stroke}
        strokeWidth={2.4}
      />
    </Svg>
  );
}

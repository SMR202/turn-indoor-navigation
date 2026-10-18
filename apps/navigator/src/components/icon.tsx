import { memo } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { MARK_PATHS } from '@turn/design';
import { ICON_PATHS, UI_ICON_PATHS as UI } from '@turn/map-scene';

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

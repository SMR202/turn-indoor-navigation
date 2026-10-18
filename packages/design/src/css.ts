import {
  darkColors,
  darkMap,
  elevation,
  fonts,
  lightColors,
  lightMap,
  motion,
  radius,
  space,
  type MapPalette,
  type ThemeColors,
} from './tokens';

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
const vars = (
  prefix: string,
  obj: Record<string, string | number>,
  unit = '',
) =>
  Object.entries(obj)
    .map(
      ([k, v]) =>
        `  --${prefix}-${kebab(k)}: ${v}${typeof v === 'number' ? unit : ''};`,
    )
    .join('\n');
const shadow = (e: { y: number; blur: number; opacity: number }) =>
  `0 ${e.y}px ${e.blur}px rgba(11,18,32,${e.opacity})`;

/** CSS custom properties for the web console: `:root` is light, `[data-theme=dark]` is dark. */
export function cssVariables(): string {
  const theme = (c: ThemeColors, m: MapPalette) =>
    [
      vars('c', c as unknown as Record<string, string>),
      vars('map', m as unknown as Record<string, string>),
    ].join('\n');
  return `:root {
${theme(lightColors, lightMap)}
${vars('space', space, 'px')}
${vars('radius', radius, 'px')}
  --shadow-card: ${shadow(elevation.card)};
  --shadow-sheet: ${shadow(elevation.sheet)};
  --shadow-floating: ${shadow(elevation.floating)};
  --font: ${fonts.web};
  --ease: cubic-bezier(${motion.easing.standard.join(',')});
  --dur-fast: ${motion.duration.fast}ms;
  --dur-base: ${motion.duration.base}ms;
  --dur-slow: ${motion.duration.slow}ms;
  color-scheme: light;
}
[data-theme='dark'] {
${theme(darkColors, darkMap)}
  color-scheme: dark;
}
@media (prefers-reduced-motion: reduce) {
  :root { --dur-fast: 0ms; --dur-base: 0ms; --dur-slow: 0ms; }
}
`;
}

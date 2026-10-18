import { palette } from './tokens';

/**
 * TURN mark: a position dot, a route leaving it, and a right turn ending in an arrow head.
 * Drawn on a 64-unit grid so it stays crisp from favicon to app icon.
 */
export const MARK_PATHS = {
  /** Route: up from the dot, round corner, then right. */
  route: 'M22 47 V31 Q22 23 30 23 H43',
  /** Arrow head at the end of the route. */
  arrow: 'M37 16 L44 23 L37 30',
  dot: { cx: 22, cy: 47, r: 4.6 },
} as const;

export function markSvg(
  options: {
    size?: number;
    tile?: string;
    stroke?: string;
    dot?: string;
    rounded?: boolean;
  } = {},
) {
  const size = options.size ?? 64;
  const tile = options.tile ?? palette.ink;
  const stroke = options.stroke ?? '#FFFFFF';
  const dot = options.dot ?? palette.accent;
  const r = options.rounded === false ? 0 : 16;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64"><rect width="64" height="64" rx="${r}" fill="${tile}"/><path d="${MARK_PATHS.route}" fill="none" stroke="${stroke}" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/><path d="${MARK_PATHS.arrow}" fill="none" stroke="${stroke}" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${MARK_PATHS.dot.cx}" cy="${MARK_PATHS.dot.cy}" r="${MARK_PATHS.dot.r}" fill="${dot}" stroke="${stroke}" stroke-width="2.4"/></svg>`;
}

/** Glyph only (no tile), for use on coloured backgrounds and Android adaptive icons. */
export function glyphSvg(
  options: {
    size?: number;
    stroke?: string;
    dot?: string;
    padding?: number;
  } = {},
) {
  const size = options.size ?? 64;
  const stroke = options.stroke ?? palette.ink;
  const dot = options.dot ?? palette.accent;
  const pad = options.padding ?? 0;
  const vb = `${-pad} ${-pad} ${64 + 2 * pad} ${64 + 2 * pad}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${vb}"><path d="${MARK_PATHS.route}" fill="none" stroke="${stroke}" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/><path d="${MARK_PATHS.arrow}" fill="none" stroke="${stroke}" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${MARK_PATHS.dot.cx}" cy="${MARK_PATHS.dot.cy}" r="${MARK_PATHS.dot.r}" fill="${dot}"/></svg>`;
}

/** Mark plus the TURN wordmark, set in Inter SemiBold with open tracking. */
export function lockupSvg(options: { height?: number; ink?: string } = {}) {
  const h = options.height ?? 40;
  const ink = options.ink ?? palette.ink;
  const w = Math.round(h * 4.1);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 164 40"><g transform="scale(0.625)">${markSvg({ tile: ink }).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g><text x="52" y="28.5" font-family="Inter, system-ui, sans-serif" font-size="25" font-weight="600" letter-spacing="4" fill="${ink}">TURN</text></svg>`;
}

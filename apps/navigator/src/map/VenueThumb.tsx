import { memo, useMemo } from 'react';
import Svg, { Path } from 'react-native-svg';
import type { MapPalette } from '@turn/design';
import { buildScene } from '@turn/map-scene';
import type { VenuePackage } from '@turn/venue-model';

/** Static miniature of a venue floor for cards (same palette and layering as the live map). */
export const VenueThumb = memo(function VenueThumb({
  pkg,
  palette,
  width,
  height,
}: {
  pkg: VenuePackage;
  palette: MapPalette;
  width: number;
  height: number;
}) {
  const paths = useMemo(() => {
    const scene = buildScene(pkg, pkg.floors[0]!.id, palette);
    const b = scene.bounds;
    const pad = 10;
    const s = Math.min(
      (width - 2 * pad) / (b.maxX - b.minX || 1),
      (height - 2 * pad) / (b.maxY - b.minY || 1),
    );
    const ox = (width - (b.maxX - b.minX) * s) / 2;
    const oy = (height - (b.maxY - b.minY) * s) / 2;
    const P = (x: number, y: number, dy = 0) =>
      `${(ox + (x - b.minX) * s).toFixed(1)} ${(oy + (b.maxY - y) * s + dy).toFixed(1)}`;
    const poly = (pts: { x: number; y: number }[], dy = 0) =>
      pts.map((p, i) => `${i ? 'L' : 'M'}${P(p.x, p.y, dy)}`).join('') + 'Z';
    return {
      rooms: scene.rooms.map((r) => ({
        id: r.id,
        d: poly(r.polygon),
        fill: r.fill,
        kind: r.kind,
      })),
      shadow: scene.rooms
        .filter((r) => r.casts)
        .map((r) => poly(r.polygon, 1.2))
        .join(''),
      walls: scene.walls
        .map((w) => `M${P(w.from.x, w.from.y)}L${P(w.to.x, w.to.y)}`)
        .join(''),
      wallW: Math.max(0.6, Math.min(1.6, 0.16 * s)),
    };
  }, [pkg, palette, width, height]);
  return (
    <Svg width={width} height={height}>
      <Path d={`M0 0H${width}V${height}H0Z`} fill={palette.land} />
      {paths.rooms
        .filter((r) => r.kind === 'outdoor' || r.kind === 'circulation')
        .map((r) => (
          <Path key={r.id} d={r.d} fill={r.fill} />
        ))}
      <Path d={paths.shadow} fill={palette.extrusion} />
      {paths.rooms
        .filter((r) => r.kind !== 'outdoor' && r.kind !== 'circulation')
        .map((r) => (
          <Path key={r.id} d={r.d} fill={r.fill} />
        ))}
      <Path
        d={paths.walls}
        stroke={palette.wall}
        strokeWidth={paths.wallW}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
});

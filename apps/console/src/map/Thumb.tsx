import { useMemo } from 'react';
import { lightMap } from '@turn/design';
import { buildScene } from '@turn/map-scene';
import type { VenuePackage } from '@turn/venue-model';

/** Static miniature of the first floor for venue cards. */
export function Thumb({
  pkg,
  width,
  height,
}: {
  pkg: VenuePackage;
  width: number;
  height: number;
}) {
  const d = useMemo(() => {
    const scene = buildScene(pkg, pkg.floors[0]!.id, lightMap);
    const b = scene.bounds;
    const pad = 14;
    const s = Math.min(
      (width - 2 * pad) / (b.maxX - b.minX || 1),
      (height - 2 * pad) / (b.maxY - b.minY || 1),
    );
    const ox = (width - (b.maxX - b.minX) * s) / 2,
      oy = (height - (b.maxY - b.minY) * s) / 2;
    const P = (x: number, y: number, dy = 0) =>
      `${(ox + (x - b.minX) * s).toFixed(1)} ${(oy + (b.maxY - y) * s + dy).toFixed(1)}`;
    const poly = (pts: { x: number; y: number }[], dy = 0) =>
      pts.map((p, i) => `${i ? 'L' : 'M'}${P(p.x, p.y, dy)}`).join('') + 'Z';
    return { scene, poly, P, s };
  }, [pkg, width, height]);
  const { scene, poly, P, s } = d;
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
    >
      {scene.rooms
        .filter((r) => r.kind === 'outdoor' || r.kind === 'circulation')
        .map((r) => (
          <path key={r.id} d={poly(r.polygon)} fill={r.fill} />
        ))}
      <path
        d={scene.rooms
          .filter((r) => r.casts)
          .map((r) => poly(r.polygon, 1.5))
          .join('')}
        fill={lightMap.extrusion}
      />
      {scene.rooms
        .filter((r) => r.kind !== 'outdoor' && r.kind !== 'circulation')
        .map((r) => (
          <path key={r.id} d={poly(r.polygon)} fill={r.fill} />
        ))}
      <path
        d={scene.walls
          .map((w) => `M${P(w.from.x, w.from.y)}L${P(w.to.x, w.to.y)}`)
          .join('')}
        stroke={lightMap.wall}
        strokeWidth={Math.max(0.7, Math.min(1.8, 0.16 * s))}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

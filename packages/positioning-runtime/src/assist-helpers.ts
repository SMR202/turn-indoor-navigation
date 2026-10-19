import type { FusionMap } from '@turn/positioning-core';
import { segmentsCross, type VenuePackage } from '@turn/venue-model';

export type P = { x: number; y: number };

export function buildFusionMap(
  venue: VenuePackage,
  floorId: string,
): FusionMap {
  const floor = venue.floors.find((f) => f.id === floorId) ?? venue.floors[0]!;
  return {
    floorId: floor.id,
    walls: floor.walls,
    walkable: floor.walkablePolygons,
  };
}

/** Nearest routing node to a point that can be reached in a straight line without crossing a wall. */
export function nearestRoutableNode(
  venue: VenuePackage,
  floorId: string,
  p: P,
) {
  const floor = venue.floors.find((f) => f.id === floorId);
  const nodes = venue.nodes.filter((n) => n.floorId === floorId);
  const clear = nodes.filter(
    (n) =>
      !floor?.walls.some((w) => segmentsCross(p as never, n, w.from, w.to)),
  );
  const pool = clear.length ? clear : nodes;
  return pool.reduce(
    (best, n) =>
      Math.hypot(n.x - p.x, n.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y)
        ? n
        : best,
    pool[0]!,
  );
}

export function nearestAnchor(venue: VenuePackage, floorId: string, p: P) {
  const anchors = venue.anchors.filter((a) => a.floorId === floorId);
  return anchors.reduce((best, a) =>
    Math.hypot(a.position.x - p.x, a.position.y - p.y) <
    Math.hypot(best.position.x - p.x, best.position.y - p.y)
      ? a
      : best,
  );
}

function inside(p: P, polygon: P[]) {
  let c = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!,
      b = polygon[j]!;
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      c = !c;
  }
  return c;
}
export function roomNameAt(
  venue: VenuePackage,
  floorId: string,
  p: P,
): string | null {
  const floor = venue.floors.find((f) => f.id === floorId);
  const room = floor?.rooms.find(
    (r) => r.kind !== 'fixture' && inside(p, r.polygon),
  );
  return room?.name ?? null;
}

/** Route polyline from the closest point on the route to its end (what is left to walk). */
export function remainingRoute(route: P[], position: P): P[] {
  if (route.length < 2) return route;
  let best = { index: 0, t: 0, dist: Infinity, point: route[0]! };
  for (let i = 0; i + 1 < route.length; i++) {
    const a = route[i]!,
      b = route[i + 1]!;
    const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const t =
      l2 === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((position.x - a.x) * (b.x - a.x) +
                (position.y - a.y) * (b.y - a.y)) /
                l2,
            ),
          );
    const point = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
    const dist = Math.hypot(position.x - point.x, position.y - point.y);
    if (dist < best.dist) best = { index: i, t, dist, point };
  }
  return [best.point, ...route.slice(best.index + 1)];
}

/** Heading (radians, +x counter-clockwise) from a position toward the first route point at least `minMetres` away. */
export function headingAlongRoute(
  route: P[],
  position: P,
  minMetres = 1,
): number | null {
  const target = route.find(
    (p) => Math.hypot(p.x - position.x, p.y - position.y) >= minMetres,
  );
  return target
    ? Math.atan2(target.y - position.y, target.x - position.x)
    : null;
}

/** Walking time at a relaxed indoor pace. */
export function etaMinutes(metres: number, metresPerSecond = 1.1) {
  return Math.max(1, Math.round(metres / metresPerSecond / 60));
}

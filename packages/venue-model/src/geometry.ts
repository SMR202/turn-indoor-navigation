import type { VenuePackage } from './schema';
type Point = { x: number; y: number };
export const feetToMetres = (feet: number) => feet * 0.3048;
export function pathLength(points: Point[]) {
  return points
    .slice(1)
    .reduce(
      (total, p, index) =>
        total + Math.hypot(p.x - points[index]!.x, p.y - points[index]!.y),
      0,
    );
}
export function segmentsCross(a: Point, b: Point, c: Point, d: Point) {
  const cross = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return (
    cross(a, b, c) * cross(a, b, d) < -1e-10 &&
    cross(c, d, a) * cross(c, d, b) < -1e-10
  );
}
/** Detects proper wall crossings; does not establish furniture clearance or accessibility. */
export function wallCrossings(venue: VenuePackage) {
  return venue.edges
    .filter((edge) => {
      const a = venue.nodes.find((n) => n.id === edge.from)!;
      const b = venue.nodes.find((n) => n.id === edge.to)!;
      if (a.floorId !== b.floorId) return false;
      return venue.floors
        .find((f) => f.id === a.floorId)!
        .walls.some((w) => segmentsCross(a, b, w.from, w.to));
    })
    .map((edge) => edge.id);
}

import type { P } from './scene';

const d = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

export function polylineLength(points: P[]) {
  let n = 0;
  for (let i = 1; i < points.length; i++) n += d(points[i - 1]!, points[i]!);
  return n;
}

/** Closest point on a polyline to `p`, with the distance travelled along the line to reach it. */
export function projectOnPolyline(points: P[], p: P) {
  let best = { point: points[0] ?? p, along: 0, distance: Infinity, index: 0 };
  let travelled = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!,
      b = points[i + 1]!;
    const len = d(a, b);
    const t =
      len === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) /
                (len * len),
            ),
          );
    const q = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
    const dist = d(p, q);
    if (dist < best.distance)
      best = { point: q, along: travelled + t * len, distance: dist, index: i };
    travelled += len;
  }
  return best;
}

/** Splits a route into the walked part and the part still ahead of the user. */
export function splitRoute(points: P[], position: P | null) {
  if (!position || points.length < 2)
    return { walked: [] as P[], remaining: points };
  const pr = projectOnPolyline(points, position);
  return {
    walked: [...points.slice(0, pr.index + 1), pr.point],
    remaining: [pr.point, ...points.slice(pr.index + 1)],
  };
}

/** Point at a distance along a polyline (for route-preview and arrival animations). */
export function pointAlong(
  points: P[],
  distance: number,
): P & { headingRad: number } {
  let left = Math.max(0, distance);
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!,
      b = points[i + 1]!;
    const len = d(a, b);
    if (left <= len || i + 2 === points.length) {
      const t = len === 0 ? 0 : Math.min(1, left / len);
      return {
        x: a.x + t * (b.x - a.x),
        y: a.y + t * (b.y - a.y),
        headingRad: Math.atan2(b.y - a.y, b.x - a.x),
      };
    }
    left -= len;
  }
  const last = points.at(-1) ?? { x: 0, y: 0 };
  return { ...last, headingRad: 0 };
}

/** Smooths route corners with short quadratic curves (SVG path, y flipped for screen space). */
export function roundedRoutePath(points: P[], radius = 0.9, flipY = true) {
  if (points.length < 2) return '';
  const Y = (v: number) => (flipY ? -v : v);
  let path = `M ${points[0]!.x} ${Y(points[0]!.y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!,
      cur = points[i]!,
      next = points[i + 1]!;
    const r = Math.min(radius, d(prev, cur) / 2, d(cur, next) / 2);
    const a = {
      x: cur.x - ((cur.x - prev.x) / (d(prev, cur) || 1)) * r,
      y: cur.y - ((cur.y - prev.y) / (d(prev, cur) || 1)) * r,
    };
    const b = {
      x: cur.x + ((next.x - cur.x) / (d(cur, next) || 1)) * r,
      y: cur.y + ((next.y - cur.y) / (d(cur, next) || 1)) * r,
    };
    path += ` L ${a.x} ${Y(a.y)} Q ${cur.x} ${Y(cur.y)} ${b.x} ${Y(b.y)}`;
  }
  const last = points.at(-1)!;
  return `${path} L ${last.x} ${Y(last.y)}`;
}

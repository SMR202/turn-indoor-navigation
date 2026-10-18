import { predictRssi } from './fusion';

export type PlannerPoint = { x: number; y: number };
export type PlannerRoom = {
  name: string;
  polygon: PlannerPoint[];
  kind?: 'room' | 'circulation' | 'outdoor' | 'stairs' | 'fixture';
};
export type PlannerInput = {
  rooms: PlannerRoom[];
  walls: { from: PlannerPoint; to: PlannerPoint }[];
  /** Candidate mounting points (map nodes work well). */
  candidates: (PlannerPoint & { id?: string })[];
  doors?: PlannerPoint[];
};
export type PlannerOptions = {
  count: number;
  /** RSSI at 1 m of the beacons that will be installed (commercial +4 dBm is about -59). */
  refRssi: number;
  exponent: number;
  /** Extra loss per wall crossed. */
  wallLossDb: number;
  /** A beacon counts as heard at a point when predicted RSSI is above this. */
  heardDbm: number;
  /** Target number of beacons heard everywhere (Esri: at least 4). */
  targetHeard: number;
  gridMetres: number;
  tags: string[];
};
export const DEFAULT_PLANNER: PlannerOptions = {
  count: 6,
  refRssi: -59,
  exponent: 2.3,
  wallLossDb: 4,
  heardDbm: -88,
  targetHeard: 4,
  gridMetres: 1,
  tags: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10'],
};
export type PlannedSite = {
  tag: string;
  x: number;
  y: number;
  id?: string;
  roomName: string | null;
};
export type PlanQuality = {
  /** Fraction of walkable points hearing at least 3 / at least `targetHeard` beacons. */
  coverage3: number;
  coverageTarget: number;
  /** Fewest beacons heard at any point. */
  minHeard: number;
  /** Ratio of the spread across to along the principal axis of the beacon layout (1 = round, 0 = a line). */
  collinearity: number;
};
export type BeaconPlan = { sites: PlannedSite[]; quality: PlanQuality };

/** Marginal value of one more audible beacon at a point that already hears `index` of them: diminishing, so beacons spread out. */
const MARGINAL = [1, 0.75, 0.55, 0.4];

function inPolygon(p: PlannerPoint, polygon: PlannerPoint[]) {
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
function cross(a: PlannerPoint, b: PlannerPoint, c: PlannerPoint) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
function crosses(
  a: PlannerPoint,
  b: PlannerPoint,
  c: PlannerPoint,
  d: PlannerPoint,
) {
  return (
    cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0
  );
}

/** How round the beacon layout is: the smaller principal spread divided by the larger. */
export function layoutRoundness(points: PlannerPoint[]) {
  if (points.length < 3) return 0;
  const mx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const my = points.reduce((s, p) => s + p.y, 0) / points.length;
  let sxx = 0,
    syy = 0,
    sxy = 0;
  for (const p of points) {
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  const tr = sxx + syy,
    det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc,
    l2 = Math.max(0, tr / 2 - disc);
  return l1 <= 0 ? 0 : Math.sqrt(l2 / l1);
}

/**
 * Chooses beacon sites by simulating coverage: a beacon is "heard" at a point when its predicted
 * RSSI (log-distance minus a per-wall loss) clears a threshold. Greedily adds the site that most
 * increases the number of points hearing the target count, with a mild preference for rooms that
 * have no beacon yet and a penalty for near-collinear layouts. The model does not know building
 * materials: verify with live readings after mounting.
 */
export function planBeacons(
  input: PlannerInput,
  partial: Partial<PlannerOptions> = {},
): BeaconPlan {
  const o = { ...DEFAULT_PLANNER, ...partial };
  const indoor = input.rooms.filter(
    (r) => r.kind !== 'outdoor' && r.kind !== 'stairs' && r.kind !== 'fixture',
  );
  const xs = input.rooms.flatMap((r) => r.polygon.map((p) => p.x));
  const ys = input.rooms.flatMap((r) => r.polygon.map((p) => p.y));
  const points: PlannerPoint[] = [];
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += o.gridMetres)
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += o.gridMetres) {
      const p = { x, y };
      if (indoor.some((r) => inPolygon(p, r.polygon))) points.push(p);
    }
  const roomOf = (p: PlannerPoint) =>
    indoor.find((r) => inPolygon(p, r.polygon)) ?? null;
  const candidates = input.candidates.filter(
    (c) =>
      roomOf(c) &&
      !(input.doors ?? []).some((d) => Math.hypot(d.x - c.x, d.y - c.y) < 0.7),
  );
  if (!points.length || !candidates.length || o.count <= 0)
    return {
      sites: [],
      quality: {
        coverage3: 0,
        coverageTarget: 0,
        minHeard: 0,
        collinearity: 0,
      },
    };
  // heard[c][p]: candidate c audible at point p.
  const heard = candidates.map((c) =>
    points.map((p) => {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      const walls = input.walls.filter((w) =>
        crosses(c, p, w.from, w.to),
      ).length;
      return (
        predictRssi({ refRssi: o.refRssi, exponent: o.exponent }, d) -
          walls * o.wallLossDb >=
        o.heardDbm
      );
    }),
  );
  const count = new Int16Array(points.length);
  const chosen: number[] = [];
  const covered = new Set<string>();
  while (chosen.length < Math.min(o.count, candidates.length)) {
    let best = -1,
      bestScore = -Infinity;
    for (let ci = 0; ci < candidates.length; ci++) {
      if (chosen.includes(ci)) continue;
      let gain = 0;
      for (let pi = 0; pi < points.length; pi++)
        if (heard[ci]![pi] && count[pi]! < o.targetHeard)
          gain += MARGINAL[Math.min(count[pi]!, MARGINAL.length - 1)]!;
      // Beacons closer than 3 m add almost no geometry.
      if (
        chosen.some(
          (k) =>
            Math.hypot(
              candidates[k]!.x - candidates[ci]!.x,
              candidates[k]!.y - candidates[ci]!.y,
            ) < 3,
        )
      )
        gain *= 0.2;
      const room = roomOf(candidates[ci]!)?.name ?? '';
      if (room && !covered.has(room)) gain += points.length * 0.05;
      if (chosen.length) {
        // Prefer well-spread layouts: up to 15% of the point count for being 10 m or more from every other beacon.
        const nearest = Math.min(
          ...chosen.map((k) =>
            Math.hypot(
              candidates[k]!.x - candidates[ci]!.x,
              candidates[k]!.y - candidates[ci]!.y,
            ),
          ),
        );
        gain += points.length * 0.15 * Math.min(1, nearest / 10);
      }
      if (chosen.length >= 2) {
        const trial = [...chosen, ci].map((k) => candidates[k]!);
        gain *= 0.4 + 0.6 * Math.min(1, layoutRoundness(trial) / 0.3);
      }
      if (gain > bestScore) {
        bestScore = gain;
        best = ci;
      }
    }
    if (best < 0) break;
    chosen.push(best);
    const c = candidates[best]!;
    covered.add(roomOf(c)?.name ?? '');
    for (let pi = 0; pi < points.length; pi++)
      if (heard[best]![pi]) count[pi]!++;
  }
  const sites: PlannedSite[] = chosen.map((ci, i) => ({
    tag: o.tags[i] ?? `B${i + 1}`,
    x: candidates[ci]!.x,
    y: candidates[ci]!.y,
    ...(candidates[ci]!.id ? { id: candidates[ci]!.id } : {}),
    roomName: roomOf(candidates[ci]!)?.name ?? null,
  }));
  return {
    sites,
    quality: {
      coverage3: points.filter((_, i) => count[i]! >= 3).length / points.length,
      coverageTarget:
        points.filter((_, i) => count[i]! >= o.targetHeard).length /
        points.length,
      minHeard: Math.min(...count),
      collinearity: layoutRoundness(sites),
    },
  };
}

/**
 * Predicted coverage of a given beacon layout (planned or placed by hand): how many beacons each
 * walkable grid point hears, with the same path-loss model and quality numbers as `planBeacons`.
 */
export function coverageMap(
  input: Pick<PlannerInput, 'rooms' | 'walls'>,
  beacons: PlannerPoint[],
  partial: Partial<PlannerOptions> = {},
): { points: (PlannerPoint & { heard: number })[]; quality: PlanQuality } {
  const o = { ...DEFAULT_PLANNER, ...partial };
  const indoor = input.rooms.filter(
    (r) => r.kind !== 'outdoor' && r.kind !== 'stairs' && r.kind !== 'fixture',
  );
  const xs = input.rooms.flatMap((r) => r.polygon.map((p) => p.x));
  const ys = input.rooms.flatMap((r) => r.polygon.map((p) => p.y));
  const points: (PlannerPoint & { heard: number })[] = [];
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += o.gridMetres)
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += o.gridMetres) {
      const p = { x, y };
      if (!indoor.some((r) => inPolygon(p, r.polygon))) continue;
      const heard = beacons.filter((b) => {
        const walls = input.walls.filter((w) =>
          crosses(b, p, w.from, w.to),
        ).length;
        return (
          predictRssi(
            { refRssi: o.refRssi, exponent: o.exponent },
            Math.hypot(b.x - p.x, b.y - p.y),
          ) -
            walls * o.wallLossDb >=
          o.heardDbm
        );
      }).length;
      points.push({ ...p, heard });
    }
  const n = Math.max(1, points.length);
  return {
    points,
    quality: {
      coverage3: points.filter((p) => p.heard >= 3).length / n,
      coverageTarget: points.filter((p) => p.heard >= o.targetHeard).length / n,
      minHeard: points.length ? Math.min(...points.map((p) => p.heard)) : 0,
      collinearity: layoutRoundness(beacons),
    },
  };
}

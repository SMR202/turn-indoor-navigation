import {
  DEFAULT_PLANNER,
  planBeacons,
  type PlannerInput,
  type PlannerOptions,
  type PlannerPoint,
  type PlannedSite,
} from './beacon-planner';

/**
 * Predicts how well a beacon layout will position people before any hardware is bought: virtual
 * beacons on the real floor plan, noisy readings at many points (log-distance loss, loss per
 * wall, per-reading noise and a per-phone offset), and the same likelihood the live filter uses
 * to estimate the position from one radio snapshot. EXPERIMENT tooling: a prediction for planning,
 * never a measured result. Radio-only snapshots are pessimistic: live positioning also uses steps,
 * walls and time, so measured accuracy should be better where the model is right.
 */
export type SimulationOptions = Pick<
  PlannerOptions,
  'refRssi' | 'exponent' | 'wallLossDb' | 'heardDbm'
> & {
  /** Reading noise (dB): body shadowing and multipath after a few seconds' averaging. */
  noiseDb: number;
  /** Spread of a phone's offset against the calibration (dB), drawn per trial. */
  phoneOffsetDb: number;
  trials: number;
  /** Spacing of the true points tested and of the positions considered (metres). */
  gridMetres: number;
  seed: number;
};
export const DEFAULT_SIMULATION: SimulationOptions = {
  refRssi: DEFAULT_PLANNER.refRssi,
  exponent: DEFAULT_PLANNER.exponent,
  wallLossDb: DEFAULT_PLANNER.wallLossDb,
  heardDbm: DEFAULT_PLANNER.heardDbm,
  noiseDb: 5,
  phoneOffsetDb: 4,
  trials: 4,
  gridMetres: 2,
  seed: 7,
};

export type SimulatedPoint = PlannerPoint & {
  /** Median position error over the trials (metres); null where no beacon is heard. */
  errorMetres: number | null;
  /** Fraction of trials that put the person in the right room. */
  roomCorrect: number;
  heard: number;
};
export type AccuracyReport = {
  points: SimulatedPoint[];
  medianErrorMetres: number;
  p90ErrorMetres: number;
  /** Fraction of snapshots placed in the right room. */
  roomAccuracy: number;
  /** Fraction of points where at least one beacon is heard. */
  coverage: number;
  beacons: number;
};

type Room = PlannerInput['rooms'][number];
function polygonArea(poly: PlannerPoint[]) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
    a += (poly[j]!.x + poly[i]!.x) * (poly[j]!.y - poly[i]!.y);
  return Math.abs(a / 2);
}
const indoorRooms = (rooms: Room[]) =>
  rooms.filter(
    (r) => r.kind !== 'outdoor' && r.kind !== 'stairs' && r.kind !== 'fixture',
  );
function inPolygon(p: PlannerPoint, polygon: PlannerPoint[]) {
  let c = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      c = !c;
  }
  return c;
}
const cross = (a: PlannerPoint, b: PlannerPoint, c: PlannerPoint) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const crosses = (
  a: PlannerPoint,
  b: PlannerPoint,
  c: PlannerPoint,
  d: PlannerPoint,
) => cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;

function rng(seed: number) {
  let a = seed >>> 0;
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => {
    const u = Math.max(1e-12, uniform());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * uniform());
  };
}
const quantile = (xs: number[], q: number) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
};

export function simulateAccuracy(
  input: Pick<PlannerInput, 'rooms' | 'walls'>,
  beacons: PlannerPoint[],
  partial: Partial<SimulationOptions> = {},
): AccuracyReport {
  const o = { ...DEFAULT_SIMULATION, ...partial };
  const rooms = indoorRooms(input.rooms);
  const xs = rooms.flatMap((r) => r.polygon.map((p) => p.x));
  const ys = rooms.flatMap((r) => r.polygon.map((p) => p.y));
  const grid: (PlannerPoint & { room: number })[] = [];
  // About 300 points at most, so big floors stay quick to simulate.
  const area = rooms.reduce((s, r) => s + polygonArea(r.polygon), 0);
  const step = Math.max(o.gridMetres, Math.sqrt(area / 300));
  if (xs.length)
    for (let x = Math.min(...xs) + step / 2; x <= Math.max(...xs); x += step)
      for (
        let y = Math.min(...ys) + step / 2;
        y <= Math.max(...ys);
        y += step
      ) {
        const room = rooms.findIndex((r) => inPolygon({ x, y }, r.polygon));
        if (room >= 0) grid.push({ x, y, room });
      }
  const empty: AccuracyReport = {
    points: [],
    medianErrorMetres: NaN,
    p90ErrorMetres: NaN,
    roomAccuracy: 0,
    coverage: 0,
    beacons: beacons.length,
  };
  if (!grid.length || !beacons.length) return empty;
  // Mean RSSI of every beacon at every grid point.
  const mean = beacons.map((b) =>
    grid.map((p) => {
      const d = Math.max(0.5, Math.hypot(b.x - p.x, b.y - p.y));
      const walls = input.walls.filter((w) =>
        crosses(b, p, w.from, w.to),
      ).length;
      return o.refRssi - 10 * o.exponent * Math.log10(d) - walls * o.wallLossDb;
    }),
  );
  // The room each beacon is in (rooms only, not corridors): the nearest-beacon rule the live app
  // uses to decide the room (strongest against its 1 m level, leading the next by 4 dB).
  const beaconRoom = beacons.map((b) => {
    const i = rooms.findIndex((r) => inPolygon(b, r.polygon));
    return i >= 0 && rooms[i]!.kind !== 'circulation' ? i : -1;
  });
  const randn = rng(o.seed);
  const sigma = o.noiseDb;
  const offsetSigma = 6;
  const shrink = (sigma * sigma) / (offsetSigma * offsetSigma);
  const allErrors: number[] = [];
  let roomHits = 0;
  let snapshots = 0;
  let coveredPoints = 0;
  const points: SimulatedPoint[] = grid.map((t, ti) => {
    const errors: number[] = [];
    let correct = 0;
    let heardTotal = 0;
    for (let k = 0; k < o.trials; k++) {
      const offset = randn() * o.phoneOffsetDb;
      const heard: { b: number; rssi: number }[] = [];
      for (let b = 0; b < beacons.length; b++) {
        const rssi = mean[b]![ti]! + offset + randn() * sigma;
        if (rssi >= o.heardDbm) heard.push({ b, rssi });
      }
      heardTotal += heard.length;
      if (!heard.length) continue;
      // Most likely grid point, with the shared offset marginalised as in the live filter.
      let best = -Infinity;
      let bestI = 0;
      for (let ci = 0; ci < grid.length; ci++) {
        let sum = 0;
        for (const h of heard) sum += h.rssi - mean[h.b]![ci]!;
        const c = sum / (heard.length + shrink);
        let ll = -(c * c) / (2 * offsetSigma * offsetSigma);
        for (const h of heard) {
          const e = h.rssi - mean[h.b]![ci]! - c;
          ll -= (e * e) / (2 * sigma * sigma);
        }
        // A strong beacon here that was not heard argues against this point.
        for (let b = 0; b < beacons.length; b++) {
          const expected = mean[b]![ci]! + c;
          if (
            expected > o.heardDbm + 2 * sigma &&
            !heard.some((h) => h.b === b)
          )
            ll -= ((expected - o.heardDbm) / sigma) ** 2 / 2;
        }
        if (ll > best) {
          best = ll;
          bestI = ci;
        }
      }
      const est = grid[bestI]!;
      errors.push(Math.hypot(est.x - t.x, est.y - t.y));
      const ranked = [...heard].sort((a, b) => b.rssi - a.rssi);
      const lead = ranked[0]!;
      const zone =
        beaconRoom[lead.b]! >= 0 && lead.rssi - (ranked[1]?.rssi ?? -200) >= 4
          ? beaconRoom[lead.b]!
          : est.room;
      if (zone === t.room) correct++;
    }
    snapshots += o.trials;
    roomHits += correct;
    if (errors.length) coveredPoints++;
    allErrors.push(...errors);
    return {
      x: t.x,
      y: t.y,
      errorMetres: errors.length ? quantile(errors, 0.5) : null,
      roomCorrect: correct / o.trials,
      heard: heardTotal / o.trials,
    };
  });
  return {
    points,
    medianErrorMetres: quantile(allErrors, 0.5),
    p90ErrorMetres: quantile(allErrors, 0.9),
    roomAccuracy: snapshots ? roomHits / snapshots : 0,
    coverage: coveredPoints / grid.length,
    beacons: beacons.length,
  };
}

export type AccuracyTarget = 'room' | '3m' | '2m';
export const TARGETS: Record<
  AccuracyTarget,
  { label: string; met: (r: AccuracyReport) => boolean }
> = {
  room: {
    label: 'Right room 9 times in 10',
    met: (r) => r.roomAccuracy >= 0.9 && r.coverage >= 0.98,
  },
  '3m': {
    label: 'About 3 m',
    met: (r) =>
      r.medianErrorMetres <= 3 && r.p90ErrorMetres <= 6 && r.coverage >= 0.98,
  },
  '2m': {
    label: 'About 2 m',
    met: (r) =>
      r.medianErrorMetres <= 2 && r.p90ErrorMetres <= 4 && r.coverage >= 0.98,
  },
};
export type TargetPlan = {
  target: AccuracyTarget;
  /** The smallest layout tried that meets the target, else the best one tried. */
  sites: PlannedSite[];
  report: AccuracyReport;
  met: boolean;
  /** Accuracy for each beacon count tried: the cost against accuracy trade-off. */
  curve: {
    beacons: number;
    medianErrorMetres: number;
    p90ErrorMetres: number;
    roomAccuracy: number;
  }[];
};

/** Fewest beacons (planned greedily, then simulated) that reach the target. */
/**
 * Planner input for one floor of a venue: rooms, walls, doors, and candidate mounting points inside
 * every room (its label point or centre) plus the walk graph (corridors), so beacons can go where
 * they separate rooms best.
 */
export function plannerInputFor(
  floor: {
    rooms: {
      name: string;
      polygon: PlannerPoint[];
      kind?: string;
      labelPosition?: PlannerPoint;
    }[];
    walls: { from: PlannerPoint; to: PlannerPoint }[];
    doors: { position: PlannerPoint }[];
  },
  nodes: (PlannerPoint & { id: string })[],
): PlannerInput {
  const rooms = floor.rooms.map((r) => ({
    name: r.name,
    polygon: r.polygon,
    kind: (r.kind ?? 'room') as PlannerInput['rooms'][number]['kind'],
  }));
  const interior = floor.rooms.flatMap((r) => {
    if ((r.kind ?? 'room') !== 'room') return [];
    const c = r.labelPosition ?? {
      x: r.polygon.reduce((s, p) => s + p.x, 0) / r.polygon.length,
      y: r.polygon.reduce((s, p) => s + p.y, 0) / r.polygon.length,
    };
    return inPolygon(c, r.polygon) ? [{ x: c.x, y: c.y }] : [];
  });
  return {
    rooms,
    walls: floor.walls,
    candidates: [
      ...interior,
      ...nodes.map((n) => ({ x: n.x, y: n.y, id: n.id })),
    ],
    doors: floor.doors.map((d) => d.position),
  };
}

export function planForTarget(
  input: PlannerInput,
  target: AccuracyTarget,
  options: {
    planner?: Partial<PlannerOptions>;
    simulation?: Partial<SimulationOptions>;
    maxBeacons?: number;
  } = {},
): TargetPlan {
  const rooms = indoorRooms(input.rooms).filter(
    (r) => r.kind !== 'circulation',
  );
  const start = Math.max(2, Math.ceil(rooms.length / 3));
  const max = Math.max(start, options.maxBeacons ?? 24);
  const tags = Array.from({ length: max }, (_, i) => `B${i + 1}`);
  const tried = new Map<
    number,
    { sites: PlannedSite[]; report: AccuracyReport }
  >();
  const at = (count: number) => {
    const known = tried.get(count);
    if (known) return known;
    const plan = planBeacons(input, { ...options.planner, count, tags });
    const report = simulateAccuracy(input, plan.sites, {
      ...options.simulation,
      ...(options.planner?.refRssi !== undefined
        ? { refRssi: options.planner.refRssi }
        : {}),
    });
    const r = { sites: plan.sites, report };
    tried.set(count, r);
    return r;
  };
  // Double until the target is met, then halve the gap: a handful of simulations, not one per count.
  let low = start - 1;
  let high = -1;
  for (let count = start; count <= max; count = Math.min(max, count * 2)) {
    if (TARGETS[target].met(at(count).report)) {
      high = count;
      break;
    }
    low = count;
    if (count === max) break;
  }
  while (high > 0 && high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (TARGETS[target].met(at(mid).report)) high = mid;
    else low = mid;
  }
  const curve: TargetPlan['curve'] = [...tried.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, r]) => ({
      beacons: r.sites.length,
      medianErrorMetres: r.report.medianErrorMetres,
      p90ErrorMetres: r.report.p90ErrorMetres,
      roomAccuracy: r.report.roomAccuracy,
    }));
  if (high > 0) {
    const r = tried.get(high)!;
    return { target, ...r, met: true, curve };
  }
  const best = [...tried.values()].sort(
    (a, b) => a.report.medianErrorMetres - b.report.medianErrorMetres,
  )[0];
  return {
    target,
    sites: best?.sites ?? [],
    report: best?.report ?? simulateAccuracy(input, []),
    met: false,
    curve,
  };
}

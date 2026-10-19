// Map-constraint evaluation (local, private: work/test-inbox + work/private/venue.json). Replays walks
// through the live pipeline - walking steps -> AssistFusion (map only, no beacons) -> DisplayPose -
// and measures wall crossings of the drawn dot, moves of the estimate that walking cannot explain,
// and, for simulated walks whose true path is known, time shown in the wrong room. Prints aggregate
// numbers only. Synthetic and replayed walks never establish venue accuracy.
// Usage: npx tsx scripts/map-constraint-eval.ts [label]
//   ROUTE=0 not navigating · HS=<rad> start heading sigma for every scenario
//   ASSIST='{"routePriorSigmaMetres":0,"fusion":{"wallSlide":false}}' and DISPLAY='{"tau":0.35}' for ablations
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  AssistFusion,
  NavigationEngine,
  recordingSchema,
} from '../packages/positioning-core/src/index';
import {
  buildWalkGraph,
  pathLength,
  walkingPath,
} from '../packages/positioning-core/src/walk-graph';
import * as helpers from '../packages/positioning-runtime/src/assist-helpers';
import {
  DEFAULT_DISPLAY,
  DisplayPose,
} from '../packages/positioning-runtime/src/display-pose';
import { calculateRoute } from '../packages/routing/src/index';
import {
  parseVenuePackage,
  segmentsCross,
} from '../packages/venue-model/src/index';

type P = { x: number; y: number };
const root = resolve(import.meta.dirname, '..');
const venue = parseVenuePackage(
  JSON.parse(readFileSync(resolve(root, 'work/private/venue.json'), 'utf8')),
);
const floor = venue.floors[0]!;
const map = helpers.buildFusionMap(venue, floor.id);
const crosses = (a: P, b: P) =>
  floor.walls.some((w) => segmentsCross(a, b, w.from, w.to));
const inPoly = (p: P, poly: P[]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!,
      b = poly[j]!;
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      c = !c;
  }
  return c;
};
// Doorway gaps between room shapes count as walkable (same connectors for before and after code).
const doorways: P[][] =
  (
    helpers as {
      doorwayConnectors?: (e: (readonly [P, P])[], w: P[][]) => P[][];
    }
  ).doorwayConnectors?.(
    venue.edges.flatMap((e) => {
      const a = venue.nodes.find(
          (n) => n.id === e.from && n.floorId === floor.id,
        ),
        b = venue.nodes.find((n) => n.id === e.to && n.floorId === floor.id);
      return a && b ? [[a, b] as const] : [];
    }),
    floor.walkablePolygons,
  ) ?? [];
const inside = (p: P) =>
  [...floor.walkablePolygons, ...doorways].some((poly) => inPoly(p, poly));
// Built here from the venue (not from the fusion map) so older code can be measured the same way.
const floorNodes = venue.nodes.filter((n) => n.floorId === floor.id);
const nodeIds = new Set(floorNodes.map((n) => n.id));
const graph = buildWalkGraph(
  floorNodes,
  venue.edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to)),
);
const rooms = floor.rooms
  .filter((r) => r.kind !== 'fixture')
  .map((r) => r.polygon);
const roomAt = (p: P) => rooms.findIndex((r) => inPoly(p, r));

type Walk = {
  id: string;
  start: P;
  raw: { t: number; x: number; y: number }[];
  route?: P[];
  /** True position at each raw step (simulated walks only). */
  truth?: P[];
};
const walks: Walk[] = [];
const dir = resolve(root, 'work/test-inbox');
for (const f of readdirSync(dir)) {
  let j: unknown;
  try {
    j = JSON.parse(readFileSync(resolve(dir, f), 'utf8'));
  } catch {
    continue;
  }
  const parsed = recordingSchema.safeParse(j);
  if (!parsed.success || parsed.data.venue?.venueId !== venue.venueId) continue;
  const rec = parsed.data;
  if (rec.observations.filter((o) => o.type === 'accelerometer').length < 100)
    continue;
  const engine = new NavigationEngine(
    venue,
    rec.sessionId,
    rec.stepLengthMetres,
    rec.algorithm,
    rec.trackingPolicy,
  );
  const raw: Walk['raw'] = [];
  let steps = -1;
  for (const o of rec.observations) {
    const s = engine.consume(o);
    if (s.pose && s.steps !== steps) {
      steps = s.steps;
      raw.push({
        t: o.timestampSeconds,
        x: s.pose.position.x,
        y: s.pose.position.y,
      });
    }
  }
  if (raw.length >= 4) walks.push({ id: f.slice(0, 8), start: raw[0]!, raw });
}
const recorded = walks.length;

// Synthetic multi-room walks along real routes in the house: steps every 0.65 m with stride noise
// and a slowly wandering heading, like a phone held in the hand (deterministic).
let rs = 7;
const rnd = () =>
  (rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0) / 4294967296;
const gauss = () =>
  Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const pois = venue.pois.filter(
  (p) => venue.nodes.find((n) => n.id === p.nodeId)?.floorId === floor.id,
);
for (let k = 0; k < 24; k++) {
  const a = pois[Math.floor(rnd() * pois.length)]!,
    b = pois[Math.floor(rnd() * pois.length)]!;
  if (a === b) continue;
  const r = calculateRoute(venue, a.nodeId, b.nodeId);
  if (r.status !== 'ok' || r.route.distanceMetres < 6) continue;
  const pts = r.route.geometry.map(({ x, y }) => ({ x, y }));
  const raw: Walk['raw'] = [{ t: 0, ...pts[0]! }];
  const truth: P[] = [pts[0]!];
  // Walk the route continuously by arc length (corners included): the truth is the point reached,
  // the sensed step is the true chord with stride noise and a slowly wandering heading.
  const at = (target: number) => {
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1]!,
        p1 = pts[i]!;
      const seg = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      if (acc + seg >= target) {
        const f = seg ? (target - acc) / seg : 0;
        return { x: p0.x + f * (p1.x - p0.x), y: p0.y + f * (p1.y - p0.y) };
      }
      acc += seg;
    }
    return pts.at(-1)!;
  };
  let t = 0,
    drift = 0,
    cur = { ...pts[0]! },
    prev = pts[0]!;
  for (let d = 0.65; d <= r.route.distanceMetres + 0.01; d += 0.65) {
    const next = at(d);
    const h = Math.atan2(next.y - prev.y, next.x - prev.x);
    const chord = Math.hypot(next.x - prev.x, next.y - prev.y);
    drift += gauss() * 0.03;
    const len = chord * (1 + gauss() * 0.05);
    cur = {
      x: cur.x + len * Math.cos(h + drift),
      y: cur.y + len * Math.sin(h + drift),
    };
    t += 0.55;
    raw.push({ t, ...cur });
    truth.push(next);
    prev = next;
  }
  walks.push({ id: 'sim' + k, start: pts[0]!, raw, route: pts, truth });
}

/** Emulates phone-in-hand error: the walker's heading is off by `rot` and strides by `scale`. */
function distort(w: Walk, rot: number, scale: number) {
  const c = Math.cos(rot),
    s = Math.sin(rot);
  return w.raw.map((p) => {
    const dx = (p.x - w.start.x) * scale,
      dy = (p.y - w.start.y) * scale;
    return {
      t: p.t,
      x: w.start.x + dx * c - dy * s,
      y: w.start.y + dx * s + dy * c,
    };
  });
}

// Ablations: ASSIST='{"routePriorSigmaMetres":0,"fusion":{"wallSlide":false}}'
const tuning = JSON.parse(process.env.ASSIST ?? '{}');
const displayTuning = JSON.parse(process.env.DISPLAY ?? '{}');
type Dyn = Record<string, ((...a: unknown[]) => void) | undefined>;
function run(
  w: Walk,
  raw: Walk['raw'],
  seed: number,
  o: { route: boolean; headingSigma: number },
) {
  const assist = new AssistFusion(map, [], tuning, seed);
  // Optional calls keep this runnable against older code for before/after numbers.
  (assist as unknown as Dyn).setPosition!.call(
    assist,
    w.start.x,
    w.start.y,
    1.2,
    o.headingSigma,
  );
  assist.syncRaw(raw[0]!.x, raw[0]!.y);
  const display = new DisplayPose({ ...DEFAULT_DISPLAY, ...displayTuning });
  if (process.env.DISPLAY_MAP !== '0')
    (display as unknown as Dyn).setMap?.call(display, map);
  if (w.route && o.route) {
    (assist as unknown as Dyn).setRoute?.call(assist, w.route);
    display.setRoute(w.route);
  }
  const est: { p: P; walked: number }[] = [{ p: w.start, walked: 0 }];
  const drawn: P[] = [];
  const errors: number[] = [];
  let wrong = 0,
    judged = 0,
    estWrong = 0,
    estJudged = 0,
    ri = 1,
    walkedSince = 0;
  const end = raw.at(-1)!.t + 3;
  for (let t = raw[0]!.t; t <= end; t += 0.1) {
    let walked = false;
    while (ri < raw.length && raw[ri]!.t <= t) {
      walkedSince += Math.hypot(
        raw[ri]!.x - raw[ri - 1]!.x,
        raw[ri]!.y - raw[ri - 1]!.y,
      );
      if (assist.walk(raw[ri]!.x, raw[ri]!.y)) walked = true;
      ri++;
    }
    const e = assist.estimate();
    if (e && walked) {
      est.push({ p: { x: e.x, y: e.y }, walked: walkedSince });
      walkedSince = 0;
      display.update(e, t, true);
      const tr = w.truth
        ? roomAt(w.truth[Math.min(ri - 1, w.truth.length - 1)]!)
        : -1;
      if (tr >= 0) {
        estJudged++;
        if (roomAt(e) !== tr) estWrong++;
      }
    } else if (e) display.update(e, t, false);
    const d = display.step(0.1);
    if (!d) continue;
    drawn.push({ ...d });
    if (w.truth) {
      const truth = w.truth[Math.min(ri - 1, w.truth.length - 1)]!;
      errors.push(Math.hypot(d.x - truth.x, d.y - truth.y));
      const tr = roomAt(truth);
      if (tr >= 0) {
        judged++;
        if (roomAt(d) !== tr) wrong++;
      }
    }
  }
  // Impossible: crossing a wall where walking round through doors is much longer than the steps taken.
  const impossible = est.slice(1).filter(({ p, walked }, i) => {
    const prev = est[i]!.p;
    if (!crosses(prev, p)) return false;
    const path = walkingPath(graph, floor.walls, prev, p);
    return !path || pathLength(path) > walked * 1.5 + 1.5;
  }).length;
  return {
    impossible,
    drawnCrossings: drawn.slice(1).filter((p, i) => crosses(drawn[i]!, p))
      .length,
    // Moves longer than the animation allows are jumps (no walkable connection, or relocalisation).
    drawnJumps: drawn
      .slice(1)
      .filter(
        (p, i) =>
          crosses(drawn[i]!, p) &&
          Math.hypot(p.x - drawn[i]!.x, p.y - drawn[i]!.y) > 0.3,
      ).length,
    outside: drawn.filter((p) => !inside(p)).length / Math.max(1, drawn.length),
    maxJump: Math.max(
      0,
      ...est
        .slice(1)
        .map(({ p }, i) => Math.hypot(p.x - est[i]!.p.x, p.y - est[i]!.p.y)),
    ),
    wrong,
    judged,
    estWrong,
    estJudged,
    errors,
  };
}

const deg = Math.PI / 180;
const scenarios = [
  { name: 'as recorded', rot: 0, scale: 1, hs: 0.1 },
  { name: 'heading +15°', rot: 15 * deg, scale: 1, hs: 0.1 },
  { name: 'heading -15°', rot: -15 * deg, scale: 1, hs: 0.1 },
  { name: 'heading +30°', rot: 30 * deg, scale: 1, hs: 0.1 },
  { name: 'heading -45°', rot: -45 * deg, scale: 1, hs: 0.1 },
  { name: 'heading +60°', rot: 60 * deg, scale: 1, hs: 0.1 },
  { name: 'stride +25%', rot: 0, scale: 1.25, hs: 0.1 },
  { name: '+45°, heading unknown', rot: 45 * deg, scale: 1, hs: 0.8 },
];
const route = process.env.ROUTE !== '0';
console.log(
  `${process.argv[2] ?? 'current'}: ${recorded} recorded home walks + ${walks.length - recorded} simulated multi-room walks (${route ? 'simulated walks navigate a route' : 'no route'}), 3 seeds each`,
);
for (const sc of scenarios) {
  let impossible = 0,
    drawn = 0,
    jumps = 0,
    runsWithCrossing = 0,
    recDrawn = 0,
    simDrawn = 0,
    outside = 0,
    jump = 0,
    wrong = 0,
    judged = 0,
    estWrong = 0,
    estJudged = 0,
    n = 0;
  const errors: number[] = [];
  for (const w of walks)
    for (const seed of [1, 2, 3]) {
      const r = run(w, distort(w, sc.rot, sc.scale), seed, {
        route,
        headingSigma: process.env.HS ? Number(process.env.HS) : sc.hs,
      });
      impossible += r.impossible;
      if (w.truth) simDrawn += r.drawnCrossings;
      else recDrawn += r.drawnCrossings;
      drawn += r.drawnCrossings;
      jumps += r.drawnJumps;
      if (r.drawnCrossings > 0) runsWithCrossing++;
      outside += r.outside;
      jump = Math.max(jump, r.maxJump);
      wrong += r.wrong;
      judged += r.judged;
      estWrong += r.estWrong;
      estJudged += r.estJudged;
      errors.push(...r.errors);
      n++;
    }
  errors.sort((a, b) => a - b);
  const q = (f: number) => errors[Math.floor(f * (errors.length - 1))] ?? NaN;
  console.log(
    `  ${sc.name.padEnd(22)} drawn wall crossings ${String(drawn).padStart(4)} (recorded ${recDrawn}, simulated ${simDrawn}; ${jumps} jumps; ${runsWithCrossing}/${n} runs) · impossible estimate moves ${String(impossible).padStart(3)} · outside walkable ${((100 * outside) / n).toFixed(1)}% · max jump ${jump.toFixed(1)} m · sims: wrong room drawn ${((100 * wrong) / Math.max(1, judged)).toFixed(1)}% / estimate ${((100 * estWrong) / Math.max(1, estJudged)).toFixed(1)}%, error p50 ${q(0.5).toFixed(2)} m, p90 ${q(0.9).toFixed(2)} m`,
  );
}

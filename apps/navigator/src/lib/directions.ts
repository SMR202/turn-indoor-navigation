import {
  pointAlong,
  pointInPolygon,
  polylineLength,
  type P,
  type Scene,
  type SceneRoom,
} from '@turn/map-scene';

export type StepKind =
  | 'depart'
  | 'slight-left'
  | 'left'
  | 'sharp-left'
  | 'slight-right'
  | 'right'
  | 'sharp-right'
  | 'u-turn'
  | 'arrive';
export type Step = {
  kind: StepKind;
  text: string;
  /** Where the manoeuvre happens (venue metres). */
  at: P;
  /** Distance from the route start to the manoeuvre (metres). */
  along: number;
  /** Distance to the next step (metres). */
  distance: number;
};

/** Assumed indoor walking speed for estimates (m/s). PROPOSED default, not measured per user. */
export const WALK_SPEED = 1.25;

const LOOK = 2; // metres either side of a vertex used to measure a turn, so door jogs read as one turn
const MIN_TURN = (25 * Math.PI) / 180;

function wrap(a: number) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Removes repeated points so every segment has length. */
export function cleanPolyline(points: P[], eps = 0.05): P[] {
  return points.filter(
    (p, i) =>
      i === 0 ||
      Math.hypot(p.x - points[i - 1]!.x, p.y - points[i - 1]!.y) > eps,
  );
}

export function roomAt(scene: Scene, p: P): SceneRoom | null {
  let best: SceneRoom | null = null;
  for (const r of scene.rooms)
    if (pointInPolygon(p, r.polygon) && (!best || r.area < best.area)) best = r;
  return best;
}

function kindFor(turn: number): StepKind {
  const a = Math.abs(turn);
  const side = turn > 0 ? 'left' : 'right'; // venue frame: y up, counter-clockwise is a left turn
  if (a > (160 * Math.PI) / 180) return 'u-turn';
  if (a > (125 * Math.PI) / 180) return `sharp-${side}`;
  if (a < (45 * Math.PI) / 180) return `slight-${side}`;
  return side;
}
const verb: Record<StepKind, string> = {
  depart: 'Head',
  'slight-left': 'Bear left',
  left: 'Turn left',
  'sharp-left': 'Turn sharp left',
  'slight-right': 'Bear right',
  right: 'Turn right',
  'sharp-right': 'Turn sharp right',
  'u-turn': 'Turn around',
  arrive: 'Arrive',
};

/**
 * Turn-by-turn steps from route geometry, named after the spaces the walker enters, like
 * "Turn left into Main Concourse". Turns closer than 2.5 m are merged.
 */
export function buildSteps(
  points: P[],
  scene: Scene,
  destination: string,
): Step[] {
  const pts = cleanPolyline(points);
  const total = polylineLength(pts);
  if (pts.length < 2 || total < 0.5)
    return [
      {
        kind: 'arrive',
        text: `You are at ${destination}`,
        at: pts[0] ?? { x: 0, y: 0 },
        along: 0,
        distance: 0,
      },
    ];
  const turns: { along: number; turn: number; at: P }[] = [];
  let along = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    along += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
    const before = pointAlong(pts, Math.max(0, along - LOOK));
    const after = pointAlong(pts, Math.min(total, along + LOOK));
    const v = pts[i]!;
    const hin = Math.atan2(v.y - before.y, v.x - before.x);
    const hout = Math.atan2(after.y - v.y, after.x - v.x);
    const turn = wrap(hout - hin);
    if (Math.abs(turn) < MIN_TURN) continue;
    const last = turns.at(-1);
    if (last && along - last.along < 2.5) {
      if (Math.abs(turn) > Math.abs(last.turn))
        Object.assign(last, { along, turn, at: v });
      continue;
    }
    turns.push({ along, turn, at: v });
  }
  const startRoom = roomAt(scene, pts[0]!);
  const firstAhead = pointAlong(
    pts,
    Math.min(total, (turns[0]?.along ?? total) * 0.6 + 0.5),
  );
  const headInto = roomAt(scene, firstAhead);
  const steps: Step[] = [
    {
      kind: 'depart',
      text:
        headInto?.name && headInto.id !== startRoom?.id
          ? `Head into ${headInto.name}`
          : headInto?.name
            ? `Head through ${headInto.name}`
            : 'Head along the highlighted route',
      at: pts[0]!,
      along: 0,
      distance: 0,
    },
  ];
  turns.forEach((t, i) => {
    const next = turns[i + 1]?.along ?? total;
    const kind = kindFor(t.turn);
    const here = roomAt(scene, pointAlong(pts, Math.max(0, t.along - 1)));
    const into = roomAt(
      scene,
      pointAlong(pts, t.along + Math.min(4, (next - t.along) * 0.7)),
    );
    const text =
      into?.name && into.id !== here?.id
        ? `${verb[kind]} into ${into.name}`
        : here?.name && here.kind !== 'circulation'
          ? `${verb[kind]} in ${here.name}`
          : verb[kind];
    steps.push({ kind, text, at: t.at, along: t.along, distance: 0 });
  });
  steps.push({
    kind: 'arrive',
    text: `Arrive at ${destination}`,
    at: pts.at(-1)!,
    along: total,
    distance: 0,
  });
  for (let i = 0; i < steps.length - 1; i++)
    steps[i]!.distance = steps[i + 1]!.along - steps[i]!.along;
  return steps;
}

export function formatDistance(m: number) {
  if (m < 1) return 'here';
  if (m < 20) return `${Math.round(m)} m`;
  return `${Math.round(m / 5) * 5} m`;
}
export function formatDuration(seconds: number) {
  if (seconds < 45) return '<1 min';
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}
export function arrivalClock(seconds: number, now = new Date()) {
  const t = new Date(now.getTime() + seconds * 1000);
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}

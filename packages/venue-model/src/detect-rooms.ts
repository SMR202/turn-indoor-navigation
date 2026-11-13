/**
 * Finds rooms in a floor-plan picture (Plan 005 §9.2, "Detect rooms"): the enclosed white areas
 * between dark wall lines, with the door openings between them. Pure: it works on a bitmap, so it
 * runs in the browser without sending the plan anywhere.
 *
 * How: walls are thickened until door openings close; what is left falls apart into separate
 * areas (one per room, plus the outside); each area then grows back to its walls, and where two
 * areas meet inside a former opening there is a door.
 *
 * It proposes; a person accepts, renames and corrects. Furniture drawn with heavy lines, missing
 * walls and plans with shading can all confuse it.
 */
export type Bitmap = {
  width: number;
  height: number;
  /** 1 where the plan has ink (walls, text), 0 where it is blank. */
  ink: Uint8Array;
};
type P = { x: number; y: number };
export type DetectedRoom = {
  /** Outline in bitmap pixels (x right, y down), without a repeated last point. */
  polygon: P[];
  /** Area in pixels. */
  area: number;
  /** Probably a corridor or hall: by far the largest area, or long with many doors. */
  circulation: boolean;
};
export type DetectedDoor = P & {
  /** Indexes into `rooms`; one index for a door to the outside. */
  between: number[];
};
export type DetectOptions = {
  /** Pixels to thicken walls by: a little more than half the widest door opening. */
  closeRadius: number;
  /** Smallest room to keep, in pixels. */
  minArea: number;
  /** Corner tolerance when straightening outlines, in pixels. */
  simplify?: number;
};

/** Dark pixels of an RGBA image as ink. Transparent pixels are blank. */
export function inkFromRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  threshold = 150,
): Bitmap {
  const ink = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const a = rgba[i * 4 + 3]!;
    const lum =
      0.299 * rgba[i * 4]! +
      0.587 * rgba[i * 4 + 1]! +
      0.114 * rgba[i * 4 + 2]!;
    ink[i] = a > 40 && lum < threshold ? 1 : 0;
  }
  return { width, height, ink };
}

/** Steps (4-neighbour) from every pixel to the nearest ink pixel, capped at `max + 1`. */
function distanceToInk({ width: W, height: H, ink }: Bitmap, max: number) {
  const d = new Uint16Array(W * H).fill(max + 1);
  let frontier: number[] = [];
  for (let i = 0; i < W * H; i++)
    if (ink[i]) {
      d[i] = 0;
      frontier.push(i);
    }
  for (let step = 1; step <= max && frontier.length; step++) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % W;
      const visit = (j: number) => {
        if (d[j]! > step) {
          d[j] = step;
          next.push(j);
        }
      };
      if (x > 0) visit(i - 1);
      if (x < W - 1) visit(i + 1);
      if (i >= W) visit(i - W);
      if (i < W * (H - 1)) visit(i + W);
    }
    frontier = next;
  }
  return d;
}

/** Outline of the pixels carrying `label`, following pixel edges clockwise from the top-left pixel. */
function trace(labels: Int32Array, W: number, H: number, label: number): P[] {
  let start = -1;
  for (let i = 0; i < W * H; i++)
    if (labels[i] === label) {
      start = i;
      break;
    }
  if (start < 0) return [];
  const is = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < W && y < H && labels[y * W + x] === label;
  const x0 = start % W;
  const y0 = Math.floor(start / W);
  let cx = x0;
  let cy = y0;
  let dir = 0; // 0 right, 1 down, 2 left, 3 up; the area is on the right-hand side.
  const pts: P[] = [{ x: cx, y: cy }];
  let moved = false;
  for (let guard = 0; guard < 8 * (W + H) * 50; guard++) {
    // Back at the first corner, facing the way we set off: the outline is closed.
    if (moved && cx === x0 && cy === y0 && dir === 0) break;
    // The two pixels ahead: on the right-hand side (R) and the left-hand side (L).
    const R =
      dir === 0
        ? is(cx, cy)
        : dir === 1
          ? is(cx - 1, cy)
          : dir === 2
            ? is(cx - 1, cy - 1)
            : is(cx, cy - 1);
    const L =
      dir === 0
        ? is(cx, cy - 1)
        : dir === 1
          ? is(cx, cy)
          : dir === 2
            ? is(cx - 1, cy)
            : is(cx - 1, cy - 1);
    if (!R) {
      dir = (dir + 1) % 4;
      pts.push({ x: cx, y: cy });
    } else if (L) {
      dir = (dir + 3) % 4;
      pts.push({ x: cx, y: cy });
    } else {
      cx += dir === 0 ? 1 : dir === 2 ? -1 : 0;
      cy += dir === 1 ? 1 : dir === 3 ? -1 : 0;
      moved = true;
    }
  }
  // Corners were pushed at every turn; drop repeats (the last turn lands on the first corner).
  const ring = pts.filter(
    (p, i) => i === 0 || p.x !== pts[i - 1]!.x || p.y !== pts[i - 1]!.y,
  );
  const last = ring.at(-1)!;
  if (ring.length > 1 && last.x === ring[0]!.x && last.y === ring[0]!.y)
    ring.pop();
  return ring;
}

function perpendicular(p: P, a: P, b: P) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}
function simplifyChain(pts: P[], eps: number): P[] {
  if (pts.length < 3) return pts;
  let worst = 0;
  let at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpendicular(pts[i]!, pts[0]!, pts.at(-1)!);
    if (d > worst) {
      worst = d;
      at = i;
    }
  }
  if (worst <= eps) return [pts[0]!, pts.at(-1)!];
  return [
    ...simplifyChain(pts.slice(0, at + 1), eps).slice(0, -1),
    ...simplifyChain(pts.slice(at), eps),
  ];
}
/** Fewer corners (Douglas–Peucker on a closed outline), then nearly square edges made square. */
export function tidyOutline(ring: P[], eps: number): P[] {
  if (ring.length < 4) return ring;
  // Split the ring at the two points furthest apart so each half simplifies as an open chain.
  let far = 0;
  for (let i = 1; i < ring.length; i++)
    if (
      Math.hypot(ring[i]!.x - ring[0]!.x, ring[i]!.y - ring[0]!.y) >
      Math.hypot(ring[far]!.x - ring[0]!.x, ring[far]!.y - ring[0]!.y)
    )
      far = i;
  const a = simplifyChain(ring.slice(0, far + 1), eps);
  const b = simplifyChain([...ring.slice(far), ring[0]!], eps);
  const out = [...a.slice(0, -1), ...b.slice(0, -1)].map((p) => ({ ...p }));
  // An edge within `eps` of horizontal or vertical becomes exactly so.
  for (let pass = 0; pass < 2; pass++)
    for (let i = 0; i < out.length; i++) {
      const p = out[i]!;
      const q = out[(i + 1) % out.length]!;
      if (Math.abs(p.x - q.x) <= eps && Math.abs(p.x - q.x) > 0) {
        const x = Math.round((p.x + q.x) / 2);
        p.x = q.x = x;
      }
      if (Math.abs(p.y - q.y) <= eps && Math.abs(p.y - q.y) > 0) {
        const y = Math.round((p.y + q.y) / 2);
        p.y = q.y = y;
      }
    }
  // Drop corners that ended up on a straight line.
  return out.filter((p, i) => {
    const a2 = out[(i + out.length - 1) % out.length]!;
    const b2 = out[(i + 1) % out.length]!;
    return (
      Math.abs((p.x - a2.x) * (b2.y - p.y) - (p.y - a2.y) * (b2.x - p.x)) > 1e-6
    );
  });
}

export function detectRooms(
  bitmap: Bitmap,
  options: DetectOptions,
): { rooms: DetectedRoom[]; doors: DetectedDoor[] } {
  const { width: W, height: H, ink } = bitmap;
  const r = Math.max(1, Math.round(options.closeRadius));
  const dist = distanceToInk(bitmap, r);

  // 1. Separate areas once the walls are thickened by r (door openings are closed).
  const labels = new Int32Array(W * H); // 0 none, -1 outside, 1.. areas
  const sizes: number[] = [0];
  const stack = new Int32Array(W * H);
  let next = 1;
  for (let seed = 0; seed < W * H; seed++) {
    if (labels[seed] !== 0 || dist[seed]! <= r) continue;
    const label = next++;
    let top = 0;
    let size = 0;
    let border = false;
    stack[top++] = seed;
    labels[seed] = label;
    while (top) {
      const i = stack[--top]!;
      size++;
      const x = i % W;
      const y = (i - x) / W;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) border = true;
      const visit = (j: number) => {
        if (labels[j] === 0 && dist[j]! > r) {
          labels[j] = label;
          stack[top++] = j;
        }
      };
      if (x > 0) visit(i - 1);
      if (x < W - 1) visit(i + 1);
      if (y > 0) visit(i - W);
      if (y < H - 1) visit(i + W);
    }
    sizes[label] = border ? -1 : size;
  }
  // Areas touching the picture's edge are the outside; crumbs are dropped.
  const keep = new Map<number, number>(); // label -> room index
  const minCore = Math.max(4, options.minArea * 0.25);
  for (let label = 1; label < next; label++)
    if (sizes[label]! >= minCore) keep.set(label, keep.size);
  for (let i = 0; i < W * H; i++) {
    const l = labels[i]!;
    if (l > 0 && !keep.has(l)) labels[i] = sizes[l] === -1 ? -1 : 0;
  }

  // 2. Grow every area (and the outside) back to its walls, a pixel at a time, together.
  let frontier: number[] = [];
  for (let i = 0; i < W * H; i++) if (labels[i] !== 0) frontier.push(i);
  const contacts = new Map<string, { x: number; y: number }[]>();
  const touch = (a: number, b: number, i: number) => {
    if (a === b || (a < 0 && b < 0)) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const list = contacts.get(key) ?? [];
    list.push({ x: i % W, y: Math.floor(i / W) });
    contacts.set(key, list);
  };
  // Twice the radius: a square corner is that many 4-neighbour steps from the thinned area.
  for (let step = 0; step <= 2 * r + 2 && frontier.length; step++) {
    const grown: number[] = [];
    for (const i of frontier) {
      const l = labels[i]!;
      const x = i % W;
      const visit = (j: number) => {
        if (ink[j]) return;
        if (labels[j] === 0) {
          labels[j] = l;
          grown.push(j);
        } else if (labels[j] !== l) touch(l, labels[j]!, j);
      };
      if (x > 0) visit(i - 1);
      if (x < W - 1) visit(i + 1);
      if (i >= W) visit(i - W);
      if (i < W * (H - 1)) visit(i + W);
    }
    frontier = grown;
  }

  // 3. Outlines.
  // Enough to drop the small bumps where an area reaches into a door opening.
  const eps = options.simplify ?? Math.max(3, Math.min(8, r * 0.35));
  const area = new Map<number, number>();
  for (let i = 0; i < W * H; i++)
    if (labels[i]! > 0) area.set(labels[i]!, (area.get(labels[i]!) ?? 0) + 1);
  const found: (DetectedRoom & { label: number })[] = [];
  for (const [label] of keep) {
    const a = area.get(label) ?? 0;
    if (a < options.minArea) continue;
    const polygon = tidyOutline(trace(labels, W, H, label), eps);
    if (polygon.length >= 3)
      found.push({ label, polygon, area: a, circulation: false });
  }
  const index = new Map(found.map((f, i) => [f.label, i]));

  // 4. Doors: where two areas met while growing back. One door per separate meeting place.
  const doors: DetectedDoor[] = [];
  const doorCount = new Array<number>(found.length).fill(0);
  for (const [key, pts] of contacts) {
    const [a, b] = key.split('|').map(Number) as [number, number];
    const between = [a, b].flatMap((l) =>
      index.has(l) ? [index.get(l)!] : [],
    );
    // Both sides dropped, or two rooms that were never real: nothing to connect.
    if (!between.length || (a > 0 && b > 0 && between.length < 2)) continue;
    const clusters: { x: number; y: number; n: number }[] = [];
    for (const p of pts) {
      const c = clusters.find(
        (k) => Math.hypot(k.x / k.n - p.x, k.y / k.n - p.y) <= 3 * r + 2,
      );
      if (c) {
        c.x += p.x;
        c.y += p.y;
        c.n++;
      } else clusters.push({ x: p.x, y: p.y, n: 1 });
    }
    for (const c of clusters) {
      doors.push({ x: c.x / c.n + 0.5, y: c.y / c.n + 0.5, between });
      for (const i of between) doorCount[i] = doorCount[i]! + 1;
    }
  }

  // 5. Corridors: clearly the largest area, or the one most rooms open onto.
  const areas = found.map((f) => f.area).sort((x, y) => x - y);
  const median = areas[Math.floor(areas.length / 2)] ?? 0;
  const mostDoors = Math.max(0, ...doorCount);
  found.forEach((f, i) => {
    f.circulation =
      found.length > 2 &&
      ((f.area > 2.5 * median && doorCount[i]! >= 2) ||
        (doorCount[i]! === mostDoors && mostDoors >= 3));
  });
  return {
    rooms: found.map(({ polygon, area: a, circulation }) => ({
      polygon,
      area: a,
      circulation,
    })),
    doors,
  };
}

import { parseVenuePackage, type VenuePackage } from './schema';
import { segmentsCross, wallCrossings } from './geometry';

/**
 * TURN Floor GeoJSON v1 (Plan 003 F3): the hand-off format for floor-plan conversion tools.
 * See docs/MAP_IMPORT_FORMAT.md. Coordinates may be metres (x right, y up) or image pixels
 * (x right, y down) with a scale. Rooms are required; walls, doors and places are optional and
 * derived when missing. The walk graph is always generated.
 */
type Pos = [number, number];
type Geometry =
  | { type: 'Polygon'; coordinates: Pos[][] }
  | { type: 'LineString'; coordinates: Pos[] }
  | { type: 'Point'; coordinates: Pos };
export type TurnFloorFeature = {
  type: 'Feature';
  geometry: Geometry;
  properties?: {
    kind?:
      | 'room'
      | 'circulation'
      | 'outdoor'
      | 'stairs'
      | 'fixture'
      | 'wall'
      | 'window'
      | 'door'
      | 'poi';
    name?: string;
    category?: string;
    id?: string;
    width?: number;
  } | null;
};
export type TurnFloorGeoJson = {
  type: 'FeatureCollection';
  turn?: {
    units?: 'metres' | 'pixels';
    metresPerPixel?: number;
    imageHeight?: number;
  };
  features: TurnFloorFeature[];
};
export type ImportOptions = {
  venueId: string;
  name: string;
  revision?: string;
  floorId?: string;
  floorLabel?: string;
  /** Default door width in metres when a door point carries none. */
  doorWidth?: number;
};
export type ImportReport = {
  rooms: number;
  walls: number;
  wallsDerived: boolean;
  doors: number;
  places: number;
  nodes: number;
  edges: number;
  unreachablePlaces: string[];
  warnings: string[];
};

type P = { x: number; y: number };
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const round = (v: number) => Math.round(v * 1000) / 1000;
function inside(p: P, poly: P[]) {
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
}
function segDist(p: P, a: P, b: P) {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t =
    l2 === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2,
          ),
        );
  return {
    d: dist(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }),
    t,
  };
}
/** A comfortable interior point for labels and graph nodes (centroid, or best grid point if concave). */
function interiorPoint(poly: P[]): P {
  const c = {
    x: poly.reduce((s, p) => s + p.x, 0) / poly.length,
    y: poly.reduce((s, p) => s + p.y, 0) / poly.length,
  };
  const edgeDist = (p: P) =>
    Math.min(
      ...poly.map((a, i) => segDist(p, a, poly[(i + 1) % poly.length]!).d),
    );
  if (inside(c, poly) && edgeDist(c) > 0.5) return c;
  const xs = poly.map((p) => p.x),
    ys = poly.map((p) => p.y);
  let best = c,
    bestD = -1;
  for (let i = 1; i < 12; i++)
    for (let j = 1; j < 12; j++) {
      const p = {
        x: Math.min(...xs) + ((Math.max(...xs) - Math.min(...xs)) * i) / 12,
        y: Math.min(...ys) + ((Math.max(...ys) - Math.min(...ys)) * j) / 12,
      };
      if (!inside(p, poly)) continue;
      const d = edgeDist(p);
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
  return best;
}

export function importFloorGeoJson(
  geo: TurnFloorGeoJson,
  options: ImportOptions,
): { venue: VenuePackage; report: ImportReport } {
  const warnings: string[] = [];
  const pixels = geo.turn?.units === 'pixels';
  const mpp = geo.turn?.metresPerPixel ?? 1;
  if (pixels && !geo.turn?.metresPerPixel)
    warnings.push(
      'Pixel coordinates without metresPerPixel: assumed 1 px = 1 m.',
    );
  const H = geo.turn?.imageHeight ?? 0;
  const toP = ([x, y]: Pos): P =>
    pixels
      ? { x: round(x * mpp), y: round((H - y) * mpp) }
      : { x: round(x), y: round(y) };
  const floorId = options.floorId ?? 'ground';
  const doorWidth = options.doorWidth ?? 0.9;

  const roomFeatures = geo.features.filter(
    (f) =>
      f.geometry.type === 'Polygon' &&
      (!f.properties?.kind ||
        ['room', 'circulation', 'outdoor', 'stairs', 'fixture'].includes(
          f.properties.kind,
        )),
  );
  if (!roomFeatures.length)
    throw new Error(
      'No room polygons found. Each room needs a Polygon feature.',
    );
  const rooms = roomFeatures.map((f, i) => {
    const ring = (
      f.geometry as Extract<Geometry, { type: 'Polygon' }>
    ).coordinates[0]!.map(toP);
    if (ring.length > 3 && dist(ring[0]!, ring.at(-1)!) < 1e-6) ring.pop();
    const kind = (f.properties?.kind ?? 'room') as
      'room' | 'circulation' | 'outdoor' | 'stairs' | 'fixture';
    const name =
      f.properties?.name?.trim() ||
      (kind === 'circulation' ? 'Corridor' : `Room ${i + 1}`);
    return {
      id: f.properties?.id ?? `room-${i + 1}`,
      name,
      polygon: ring,
      labelPosition: interiorPoint(ring),
      kind,
      category: f.properties?.category,
      named: Boolean(f.properties?.name?.trim()),
    };
  });
  const doorPoints = geo.features
    .filter((f) => f.geometry.type === 'Point' && f.properties?.kind === 'door')
    .map((f, i) => ({
      id: f.properties?.id ?? `door-${i + 1}`,
      position: toP(
        (f.geometry as Extract<Geometry, { type: 'Point' }>).coordinates,
      ),
      widthMetres: f.properties?.width
        ? pixels
          ? f.properties.width * mpp
          : f.properties.width
        : doorWidth,
    }));

  // Walls: as given, or derived from room outlines with gaps cut at doors. Shared edges are deduplicated.
  let walls = geo.features
    .filter(
      (f) => f.geometry.type === 'LineString' && f.properties?.kind === 'wall',
    )
    .flatMap((f) => {
      const pts = (
        f.geometry as Extract<Geometry, { type: 'LineString' }>
      ).coordinates.map(toP);
      return pts.slice(1).map((p, i) => ({ from: pts[i]!, to: p }));
    });
  const wallsDerived = walls.length === 0;
  const cut = (seg: { from: P; to: P }) => {
    let parts = [seg];
    for (const door of doorPoints) {
      const next: { from: P; to: P }[] = [];
      for (const s of parts) {
        const { d, t } = segDist(door.position, s.from, s.to);
        const len = dist(s.from, s.to);
        if (d > 0.35 || len === 0) {
          next.push(s);
          continue;
        }
        const half = door.widthMetres / 2 / len;
        const t0 = Math.max(0, t - half),
          t1 = Math.min(1, t + half);
        const at = (u: number) => ({
          x: round(s.from.x + u * (s.to.x - s.from.x)),
          y: round(s.from.y + u * (s.to.y - s.from.y)),
        });
        if (t0 > 0.001) next.push({ from: s.from, to: at(t0) });
        if (t1 < 0.999) next.push({ from: at(t1), to: s.to });
      }
      parts = next;
    }
    return parts;
  };
  if (wallsDerived) {
    const seen = new Set<string>();
    for (const r of rooms) {
      if (r.kind === 'outdoor') continue;
      r.polygon.forEach((a, i) => {
        const b = r.polygon[(i + 1) % r.polygon.length]!;
        const key = [a, b]
          .map((p) => `${p.x},${p.y}`)
          .sort()
          .join('|');
        if (seen.has(key)) return;
        seen.add(key);
        walls.push({ from: a, to: b });
      });
    }
  }
  walls = walls.flatMap(cut);
  const windows = geo.features
    .filter(
      (f) =>
        f.geometry.type === 'LineString' && f.properties?.kind === 'window',
    )
    .flatMap((f) => {
      const pts = (
        f.geometry as Extract<Geometry, { type: 'LineString' }>
      ).coordinates.map(toP);
      return pts.slice(1).map((p, i) => ({ from: pts[i]!, to: p }));
    });

  // Walk graph: a node per room interior and per door; rooms connect to their doors, doors in the
  // same room connect to each other, so routes go room → door → (corridor) → door → room.
  const nodes: { id: string; floorId: string; x: number; y: number }[] = [];
  const edges: {
    id: string;
    from: string;
    to: string;
    distanceMetres: number;
    bidirectional: boolean;
    stepFree: boolean;
  }[] = [];
  const clear = (a: P, b: P) =>
    !walls.some((w) => segmentsCross(a, b, w.from, w.to));
  for (const r of rooms)
    nodes.push({
      id: `n-${r.id}`,
      floorId,
      x: r.labelPosition.x,
      y: r.labelPosition.y,
    });
  for (const d of doorPoints)
    nodes.push({ id: `n-${d.id}`, floorId, x: d.position.x, y: d.position.y });
  const onBoundary = (p: P, poly: P[]) =>
    poly.some((a, i) => segDist(p, a, poly[(i + 1) % poly.length]!).d < 0.35);
  const addEdge = (a: string, b: string) => {
    if (
      a === b ||
      edges.some(
        (e) => (e.from === a && e.to === b) || (e.from === b && e.to === a),
      )
    )
      return;
    const na = nodes.find((n) => n.id === a)!,
      nb = nodes.find((n) => n.id === b)!;
    if (!clear(na, nb)) return;
    edges.push({
      id: `${a}--${b}`,
      from: a,
      to: b,
      distanceMetres: Math.max(0.01, round(dist(na, nb))),
      bidirectional: true,
      stepFree: true,
    });
  };
  for (const r of rooms) {
    const doorsHere = doorPoints.filter((d) =>
      onBoundary(d.position, r.polygon),
    );
    for (const d of doorsHere) addEdge(`n-${r.id}`, `n-${d.id}`);
    for (let i = 0; i < doorsHere.length; i++)
      for (let j = i + 1; j < doorsHere.length; j++)
        addEdge(`n-${doorsHere[i]!.id}`, `n-${doorsHere[j]!.id}`);
  }
  if (!doorPoints.length)
    warnings.push(
      'No doors given: rooms are not connected, so routing is limited to single rooms.',
    );

  // Places: explicit POIs, else every named, non-corridor room.
  const explicit = geo.features.filter(
    (f) => f.geometry.type === 'Point' && f.properties?.kind === 'poi',
  );
  const pois = explicit.length
    ? explicit.map((f, i) => {
        const p = toP(
          (f.geometry as Extract<Geometry, { type: 'Point' }>).coordinates,
        );
        const room = rooms.find((r) => inside(p, r.polygon));
        return {
          id: f.properties?.id ?? `place-${i + 1}`,
          name: f.properties?.name ?? room?.name ?? `Place ${i + 1}`,
          category: f.properties?.category ?? room?.kind ?? 'room',
          nodeId: room
            ? `n-${room.id}`
            : nodes.reduce((b, n) => (dist(n, p) < dist(b, p) ? n : b)).id,
        };
      })
    : rooms
        .filter((r) => r.named && r.kind !== 'circulation')
        .map((r) => ({
          id: `place-${r.id}`,
          name: r.name,
          category: r.category ?? r.kind,
          nodeId: `n-${r.id}`,
        }));

  const xs = rooms.flatMap((r) => r.polygon.map((p) => p.x));
  const ys = rooms.flatMap((r) => r.polygon.map((p) => p.y));
  const venue = parseVenuePackage({
    schemaVersion: 1,
    venueId: options.venueId,
    revision: options.revision ?? '1',
    name: options.name,
    provenance: {
      kind: 'plan-derived',
      rights: 'Imported by the venue owner.',
      description: 'Imported from TURN Floor GeoJSON v1.',
    },
    frame: {
      units: 'metres',
      axes: 'x-right-y-up',
      originDescription: pixels
        ? 'Bottom-left of the source image.'
        : 'Source coordinate origin.',
    },
    floors: [
      {
        id: floorId,
        label: options.floorLabel ?? 'Ground floor',
        level: 0,
        widthMetres: Math.max(1, round(Math.max(...xs))),
        heightMetres: Math.max(1, round(Math.max(...ys))),
        windows,
        rooms: rooms.map(({ id, name, polygon, labelPosition, kind }) => ({
          id,
          name,
          polygon,
          labelPosition,
          kind,
        })),
        walkablePolygons: rooms
          .filter((r) => r.kind !== 'fixture')
          .map((r) => r.polygon),
        walls,
        doors: doorPoints,
      },
    ],
    nodes,
    edges,
    pois,
    anchors: [],
    testCourses: [],
    connectors: [],
    assets: [],
  });
  const crossing = wallCrossings(venue);
  if (crossing.length)
    warnings.push(`${crossing.length} graph edges cross walls.`);
  // Reachability from the first node with doors.
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
    adj.set(e.to, [...(adj.get(e.to) ?? []), e.from]);
  }
  const start = edges[0]?.from;
  const seen = new Set<string>(start ? [start] : []);
  const queue = start ? [start] : [];
  while (queue.length)
    for (const n of adj.get(queue.shift()!) ?? [])
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
  const unreachablePlaces = pois
    .filter((p) => !seen.has(p.nodeId))
    .map((p) => p.name);
  if (unreachablePlaces.length)
    warnings.push(
      `${unreachablePlaces.length} places cannot be reached from the rest of the floor.`,
    );
  return {
    venue,
    report: {
      rooms: rooms.length,
      walls: walls.length,
      wallsDerived,
      doors: doorPoints.length,
      places: pois.length,
      nodes: nodes.length,
      edges: edges.length,
      unreachablePlaces,
      warnings,
    },
  };
}

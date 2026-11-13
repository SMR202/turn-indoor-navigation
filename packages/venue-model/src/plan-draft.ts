import type { TurnFloorFeature, TurnFloorGeoJson } from './geojson-import';
import type { VenuePackage } from './schema';

/**
 * A floor being drawn or traced in TURN Studio (Plan 005 §9.2). Coordinates are plan units: the
 * pixels of the plan picture when there is one, x right and y **down**. `metresPerUnit` is the
 * scale. The draft becomes TURN Floor GeoJSON, and the ordinary importer builds walls and the walk
 * graph from it.
 */
type P = { x: number; y: number };
export type DraftRoomKind =
  'room' | 'circulation' | 'stairs' | 'outdoor' | 'fixture';
export type DraftRoom = {
  id: string;
  name: string;
  kind: DraftRoomKind;
  category?: string;
  points: P[];
};
export type DraftDoor = P & { id: string; widthMetres?: number };
export type DraftPlace = P & { id: string; name: string; category: string };
export type PlanDraft = {
  /** Sheet size in plan units. */
  width: number;
  height: number;
  metresPerUnit: number;
  /** False until a real distance has been entered: positions would be guesses. */
  scaled: boolean;
  rooms: DraftRoom[];
  doors: DraftDoor[];
  /** Places that are not rooms (a kiosk in a hall). */
  places: DraftPlace[];
};

export const emptyDraft = (
  width = 2000,
  height = 1400,
  metresPerUnit = 0.05,
): PlanDraft => ({
  width,
  height,
  metresPerUnit,
  scaled: false,
  rooms: [],
  doors: [],
  places: [],
});

const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
function nearestOnSegment(p: P, a: P, b: P) {
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
  const q = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  return { point: q, distance: dist(p, q) };
}
export function polygonAreaUnits(points: P[]) {
  let a = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++)
    a += (points[j]!.x + points[i]!.x) * (points[j]!.y - points[i]!.y);
  return Math.abs(a / 2);
}
export function pointInRoom(p: P, points: P[]) {
  let c = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      c = !c;
  }
  return c;
}

export type Snap = {
  point: P;
  /** What the point snapped to. */
  to: 'corner' | 'edge' | 'axis' | null;
};
/**
 * Where a drawn point should land: on an existing corner, else on an existing edge, else in line
 * (horizontally or vertically) with `anchor`. `tolerance` is in plan units, so the caller keeps it
 * constant on screen at any zoom. `skip` leaves out one room (the one being reshaped).
 */
export function snapPoint(
  p: P,
  draft: PlanDraft,
  tolerance: number,
  options: { anchor?: P | null; skipRoom?: string | null } = {},
): Snap {
  let best: { point: P; d: number } | null = null;
  const rooms = draft.rooms.filter((r) => r.id !== options.skipRoom);
  for (const r of rooms)
    for (const c of r.points) {
      const d = dist(p, c);
      if (d <= tolerance && (!best || d < best.d)) best = { point: c, d };
    }
  if (best) return { point: { ...best.point }, to: 'corner' };
  for (const r of rooms)
    for (let i = 0; i < r.points.length; i++) {
      const n = nearestOnSegment(
        p,
        r.points[i]!,
        r.points[(i + 1) % r.points.length]!,
      );
      if (n.distance <= tolerance && (!best || n.distance < best.d))
        best = { point: n.point, d: n.distance };
    }
  if (best) return { point: best.point, to: 'edge' };
  const a = options.anchor;
  if (a) {
    const dx = Math.abs(p.x - a.x);
    const dy = Math.abs(p.y - a.y);
    // Within about six degrees of straight: make it straight.
    if (dx > 0 && dy / dx < 0.1)
      return { point: { x: p.x, y: a.y }, to: 'axis' };
    if (dy > 0 && dx / dy < 0.1)
      return { point: { x: a.x, y: p.y }, to: 'axis' };
  }
  return { point: p, to: null };
}

/** The nearest room edge to a point, for placing doors on walls. */
export function nearestEdge(p: P, draft: PlanDraft) {
  let best: { point: P; distance: number; roomId: string } | null = null;
  for (const r of draft.rooms)
    for (let i = 0; i < r.points.length; i++) {
      const n = nearestOnSegment(
        p,
        r.points[i]!,
        r.points[(i + 1) % r.points.length]!,
      );
      if (!best || n.distance < best.distance) best = { ...n, roomId: r.id };
    }
  return best;
}

/** Door-to-wall tolerance of the importer, in metres. */
const DOOR_TOLERANCE_METRES = 0.35;

export type DraftCheck = {
  /** Problems that stop the floor from being built. */
  errors: string[];
  /** Things worth fixing first. */
  warnings: string[];
  /** Rooms nobody can reach: no door on their outline. */
  roomsWithoutDoor: string[];
  /** Doors that sit on no room's outline. */
  strayDoors: string[];
};
/** Live checks while drawing, in the words a venue team would use. */
export function checkDraft(draft: PlanDraft): DraftCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const tol = DOOR_TOLERANCE_METRES / draft.metresPerUnit;
  const onOutline = (d: P, r: DraftRoom) =>
    r.points.some(
      (a, i) =>
        nearestOnSegment(d, a, r.points[(i + 1) % r.points.length]!).distance <=
        tol,
    );
  if (!draft.rooms.length) errors.push('Draw at least one room.');
  if (!draft.scaled)
    warnings.push(
      'The scale is not set: measure one known distance so walking times and positions are right.',
    );
  const walkable = draft.rooms.filter(
    (r) => r.kind !== 'fixture' && r.kind !== 'outdoor',
  );
  const roomsWithoutDoor = walkable
    .filter((r) => !draft.doors.some((d) => onOutline(d, r)))
    .map((r) => r.id);
  if (walkable.length > 1 && roomsWithoutDoor.length)
    warnings.push(
      `${roomsWithoutDoor.length} ${roomsWithoutDoor.length === 1 ? 'room has' : 'rooms have'} no door, so no route can reach ${roomsWithoutDoor.length === 1 ? 'it' : 'them'}.`,
    );
  const strayDoors = draft.doors
    .filter((d) => !draft.rooms.some((r) => onOutline(d, r)))
    .map((d) => d.id);
  if (strayDoors.length)
    warnings.push(
      `${strayDoors.length} ${strayDoors.length === 1 ? 'door is' : 'doors are'} not on a wall.`,
    );
  const unnamed = draft.rooms.filter(
    (r) => r.kind === 'room' && !r.name.trim(),
  ).length;
  if (unnamed)
    warnings.push(
      `${unnamed} ${unnamed === 1 ? 'room has' : 'rooms have'} no name and will not be a destination.`,
    );
  const tiny = draft.rooms.filter(
    (r) => polygonAreaUnits(r.points) * draft.metresPerUnit ** 2 < 0.5,
  ).length;
  if (tiny)
    warnings.push(
      `${tiny} ${tiny === 1 ? 'shape is' : 'shapes are'} smaller than half a square metre: check the scale.`,
    );
  if (!draft.rooms.some((r) => r.kind === 'circulation') && walkable.length > 2)
    warnings.push(
      'No corridor or hall is marked. Set the space people walk through to “Corridor or hall”.',
    );
  return { errors, warnings, roomsWithoutDoor, strayDoors };
}

/** The draft as TURN Floor GeoJSON (pixel units, y down), ready for the importer. */
export function draftToGeoJson(draft: PlanDraft): TurnFloorGeoJson {
  const features: TurnFloorFeature[] = [
    ...draft.rooms.map((r): TurnFloorFeature => ({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [...r.points, r.points[0]!].map(
            (p) => [p.x, p.y] as [number, number],
          ),
        ],
      },
      properties: {
        kind: r.kind,
        id: r.id,
        ...(r.name.trim() ? { name: r.name.trim() } : {}),
        ...(r.category ? { category: r.category } : {}),
      },
    })),
    ...draft.doors.map((d): TurnFloorFeature => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [d.x, d.y] },
      properties: {
        kind: 'door',
        id: d.id,
        ...(d.widthMetres
          ? { width: d.widthMetres / draft.metresPerUnit }
          : {}),
      },
    })),
    ...draft.places.map((p): TurnFloorFeature => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.x, p.y] },
      properties: { kind: 'poi', id: p.id, name: p.name, category: p.category },
    })),
  ];
  return {
    type: 'FeatureCollection',
    turn: {
      units: 'pixels',
      metresPerPixel: draft.metresPerUnit,
      imageHeight: draft.height,
    },
    features,
  };
}

/**
 * An existing floor as a draft, so its rooms and doors can be reshaped. Rebuilding the floor from
 * the draft derives its walls from the room outlines again: free-standing walls and windows of
 * the original are not kept (`lossy` says when the floor had any).
 */
export function floorToDraft(
  pkg: VenuePackage,
  floorId: string,
  unitsPerMetre = 20,
): { draft: PlanDraft; lossy: boolean } | null {
  const floor = pkg.floors.find((f) => f.id === floorId);
  if (!floor) return null;
  const margin = 2 * unitsPerMetre;
  const height = Math.ceil(floor.heightMetres * unitsPerMetre) + margin;
  const width = Math.ceil(floor.widthMetres * unitsPerMetre) + margin;
  const u = (p: P): P => ({
    x: Math.round(p.x * unitsPerMetre * 100) / 100,
    y: Math.round((height - p.y * unitsPerMetre) * 100) / 100,
  });
  const node = new Map(pkg.nodes.map((n) => [n.id, n]));
  const roomNames = new Set(floor.rooms.map((r) => r.name));
  // Places that are not a named room (kiosks, desks): kept as points.
  const places = pkg.pois.flatMap((poi) => {
    const n = node.get(poi.nodeId);
    if (!n || n.floorId !== floorId || roomNames.has(poi.name)) return [];
    return [{ id: poi.id, name: poi.name, category: poi.category, ...u(n) }];
  });
  const outlineEdges = floor.rooms.reduce(
    (s, r) => s + (r.kind === 'outdoor' ? 0 : r.polygon.length),
    0,
  );
  return {
    draft: {
      width,
      height,
      metresPerUnit: 1 / unitsPerMetre,
      scaled: true,
      rooms: floor.rooms.map((r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        points: r.polygon.map(u),
      })),
      doors: floor.doors.map((d) => ({
        id: d.id,
        ...u(d.position),
        widthMetres: d.widthMetres,
      })),
      places,
    },
    // More wall pieces than the outlines explain (after door cuts), or windows: something is lost.
    lossy:
      (floor.windows?.length ?? 0) > 0 ||
      floor.walls.length > outlineEdges + 2 * floor.doors.length + 4,
  };
}

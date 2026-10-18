import {
  normaliseCategory,
  placeCategories,
  type MapPalette,
  type PlaceCategory,
} from '@turn/design';
import type { VenuePackage } from '@turn/venue-model';

export type P = { x: number; y: number };
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export type SceneRoom = {
  id: string;
  name: string;
  kind: 'room' | 'circulation' | 'outdoor' | 'stairs' | 'fixture';
  polygon: P[];
  fill: string;
  /** Drawn behind the room, shifted down by `extrusionMetres`, to suggest wall height. */
  casts: boolean;
  labelAnchor: P;
  area: number;
  /** Lower is more important when labels compete for space. */
  priority: number;
  placeId: string | null;
  category: PlaceCategory | null;
};
export type ScenePlace = {
  id: string;
  name: string;
  category: PlaceCategory;
  categoryLabel: string;
  icon: string;
  nodeId: string;
  x: number;
  y: number;
  roomId: string | null;
};
export type Scene = {
  venueId: string;
  floorId: string;
  bounds: Bounds;
  rooms: SceneRoom[];
  walls: { from: P; to: P }[];
  windows: { from: P; to: P }[];
  doors: { id: string; position: P; widthMetres: number }[];
  places: ScenePlace[];
  palette: MapPalette;
  extrusionMetres: number;
};

export function polygonArea(poly: P[]) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
    a += (poly[j]!.x + poly[i]!.x) * (poly[j]!.y - poly[i]!.y);
  return Math.abs(a / 2);
}
export function pointInPolygon(p: P, poly: P[]) {
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

/** Category for a place: explicit category first, then its name (venues often label rooms generically). */
export function inferPlaceCategory(
  name: string,
  category: string,
): PlaceCategory {
  const fromCategory = normaliseCategory(category);
  const generic = ['room', 'other', 'circulation'];
  if (!generic.includes(fromCategory)) return fromCategory;
  const fromName = normaliseCategory(name);
  return generic.includes(fromName)
    ? fromCategory === 'other'
      ? 'room'
      : fromCategory
    : fromName;
}

const KIND_PRIORITY = {
  room: 1,
  stairs: 2,
  circulation: 3,
  fixture: 4,
  outdoor: 5,
} as const;

/** Builds the styled, render-ready description of one floor. Pure: no rendering library. */
export function buildScene(
  venue: VenuePackage,
  floorId: string,
  palette: MapPalette,
): Scene {
  const floor = venue.floors.find((f) => f.id === floorId) ?? venue.floors[0]!;
  const nodes = new Map(venue.nodes.map((n) => [n.id, n]));
  const places: ScenePlace[] = venue.pois.flatMap((poi) => {
    const n = nodes.get(poi.nodeId);
    if (!n || n.floorId !== floor.id) return [];
    const category = inferPlaceCategory(poi.name, poi.category);
    return [
      {
        id: poi.id,
        name: poi.name,
        category,
        categoryLabel: placeCategories[category].label,
        icon: placeCategories[category].icon,
        nodeId: poi.nodeId,
        x: n.x,
        y: n.y,
        roomId: null,
      },
    ];
  });
  const sourceRooms = floor.rooms.length
    ? floor.rooms
    : floor.walkablePolygons.map((polygon, i) => ({
        id: `area-${i}`,
        name: '',
        polygon,
        labelPosition: centroid(polygon),
        kind: 'circulation' as const,
      }));
  const rooms: SceneRoom[] = sourceRooms.map((r) => {
    const place =
      places.find((p) => pointInPolygon(p, r.polygon) && p.name === r.name) ??
      places.find((p) => pointInPolygon(p, r.polygon)) ??
      null;
    if (place && !place.roomId) place.roomId = r.id;
    const kind = r.kind ?? 'room';
    const fill =
      kind === 'outdoor'
        ? palette.outdoor
        : kind === 'stairs'
          ? palette.stairs
          : kind === 'circulation'
            ? palette.circulation
            : kind === 'fixture'
              ? palette.fixture
              : palette.room;
    return {
      id: r.id,
      name: r.name,
      kind,
      polygon: r.polygon,
      fill,
      casts: kind === 'room' || kind === 'stairs' || kind === 'fixture',
      labelAnchor: r.labelPosition,
      area: polygonArea(r.polygon),
      priority:
        KIND_PRIORITY[kind] * 1000 - Math.min(999, polygonArea(r.polygon)),
      placeId: place?.id ?? null,
      category: place ? place.category : null,
    };
  });
  const xs = [
    ...sourceRooms.flatMap((r) => r.polygon.map((p) => p.x)),
    0,
    floor.widthMetres,
  ];
  const ys = [
    ...sourceRooms.flatMap((r) => r.polygon.map((p) => p.y)),
    0,
    floor.heightMetres,
  ];
  return {
    venueId: venue.venueId,
    floorId: floor.id,
    bounds: {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    },
    rooms,
    walls: floor.walls,
    windows: floor.windows ?? [],
    doors: floor.doors,
    places,
    palette,
    extrusionMetres: 0.22,
  };
}

export function centroid(poly: P[]): P {
  return {
    x: poly.reduce((s, p) => s + p.x, 0) / poly.length,
    y: poly.reduce((s, p) => s + p.y, 0) / poly.length,
  };
}

export type Camera = { cx: number; cy: number; scale: number };
/** Camera that fits bounds into a viewport (pixels), leaving padding and reserved overlay space. */
export function fitCamera(
  b: Bounds,
  viewport: { width: number; height: number },
  insets: { top: number; bottom: number; left?: number; right?: number } = {
    top: 0,
    bottom: 0,
  },
  padding = 16,
): Camera & { focusY: number } {
  const w = Math.max(
    1,
    viewport.width - (insets.left ?? 0) - (insets.right ?? 0) - 2 * padding,
  );
  const h = Math.max(
    1,
    viewport.height - insets.top - insets.bottom - 2 * padding,
  );
  const scale = Math.min(
    w / (b.maxX - b.minX || 1),
    h / (b.maxY - b.minY || 1),
  );
  return {
    cx: (b.minX + b.maxX) / 2,
    cy: (b.minY + b.maxY) / 2,
    scale,
    focusY: insets.top + padding + h / 2,
  };
}

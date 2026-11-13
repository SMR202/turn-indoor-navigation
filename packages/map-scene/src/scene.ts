import {
  categoryColors,
  mixHex,
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
  /**
   * Drawn as a low solid block on the 3D map (places you go to), unless it is opened: the room the
   * walker is in, rooms a route passes through and the destination show their floor instead.
   */
  block: boolean;
  /** Colour of the block's top: the room colour with a faint tint of its place category. */
  top: string;
  /** Block height in metres. */
  blockHeight: number;
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

/** Heights on the 3D map (metres): low enough that nothing hides the route or the walker. */
export const BLOCK_HEIGHT = 1.8;
export const FIXTURE_HEIGHT = 0.7;
export const WALL_HEIGHT = 0.9;
export const LIFT_HEIGHT = 2.7;

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
  // Destinations are often placed at a room's door, just outside its outline (TURN-Mapper puts
  // them on the walk graph): match by the same name, then by being inside, then by being at the
  // door, so tapping anywhere in a room opens its place.
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const claimed = new Set<string>();
  const linkFor = (r: (typeof sourceRooms)[number]) => {
    const free = places.filter((p) => !claimed.has(p.id));
    const named = r.name.trim()
      ? free.filter((p) => norm(p.name) === norm(r.name))
      : [];
    return (
      named.find((p) => pointInPolygon(p, r.polygon)) ??
      named.sort(
        (a, b) => edgeDistance(a, r.polygon) - edgeDistance(b, r.polygon),
      )[0] ??
      free.find((p) => pointInPolygon(p, r.polygon)) ??
      free.find(
        (p) =>
          (r.kind ?? 'room') === 'room' &&
          !r.name.trim() &&
          edgeDistance(p, r.polygon) < 0.8,
      ) ??
      null
    );
  };
  const rooms: SceneRoom[] = sourceRooms.map((r) => {
    const place = linkFor(r);
    if (place) {
      claimed.add(place.id);
      if (!place.roomId) place.roomId = r.id;
    }
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
    const tinted = (base: string, strength: number) =>
      place && place.category !== 'room' && place.category !== 'other'
        ? mixHex(base, categoryColors[place.category], strength)
        : base;
    return {
      id: r.id,
      name: r.name,
      kind,
      polygon: r.polygon,
      fill: kind === 'room' ? tinted(fill, palette.blockTint * 0.7) : fill,
      casts: kind === 'room' || kind === 'stairs' || kind === 'fixture',
      block: kind === 'room' || kind === 'fixture',
      top:
        kind === 'fixture'
          ? palette.fixture
          : tinted(palette.block, palette.blockTint),
      blockHeight: kind === 'fixture' ? FIXTURE_HEIGHT : BLOCK_HEIGHT,
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

/**
 * Applies venue-owner edits (TURN Studio place details) to a scene: a new display name and/or
 * category for a place, mirrored onto the room it occupies so labels match. Geometry is untouched.
 */
export function applyPlaceOverrides(
  scene: Scene,
  overrides: Record<string, { name?: string; category?: string } | undefined>,
): Scene {
  const places = scene.places.map((p) => {
    const o = overrides[p.id];
    if (!o?.name && !o?.category) return p;
    const category = o.category ? normaliseCategory(o.category) : p.category;
    return {
      ...p,
      name: o.name?.trim() || p.name,
      category,
      categoryLabel: placeCategories[category].label,
      icon: placeCategories[category].icon,
    };
  });
  const byId = new Map(places.map((p) => [p.id, p]));
  const rooms = scene.rooms.map((r) => {
    const p = r.placeId ? byId.get(r.placeId) : undefined;
    const o = r.placeId ? overrides[r.placeId] : undefined;
    if (!p || (!o?.name && !o?.category)) return r;
    return {
      ...r,
      name: o.name?.trim() ? p.name : r.name,
      category: p.category,
    };
  });
  return { ...scene, places, rooms };
}

/** Distance (metres) from a point to the nearest edge of a polygon. */
export function edgeDistance(p: P, poly: P[]) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j]!;
    const b = poly[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(
      0,
      Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2),
    );
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return best;
}

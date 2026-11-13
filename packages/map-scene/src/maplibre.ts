import type {
  LayerSpecification,
  StyleSpecification,
} from '@maplibre/maplibre-gl-style-spec';
import type { Feature, FeatureCollection } from 'geojson';
import type { MapPalette } from '@turn/design';
import { categoryColors, placeCategories } from '@turn/design';
import { toLngLat, type Georeference } from './geo';
import {
  centroid,
  LIFT_HEIGHT,
  pointInPolygon,
  WALL_HEIGHT,
  type P,
  type Scene,
} from './scene';

/**
 * One MapLibre description of a venue floor (ADR-0013), shared by the phone map, the web map and
 * TURN Studio. Static geometry lives in the style; the route, selection, markers and the blue dot
 * are separate sources the renderers update (`dynamicLayers` and the `*Data` builders).
 *
 * The look (Plan 005 §5.1): rooms are low solid blocks with their name on top, corridors and halls
 * are open floor, and the room the walker is in, the rooms on the route and the destination open
 * up to show their floor.
 */
export type MapStyleOptions = {
  georef: Georeference;
  /** MapLibre glyph URL template, e.g. `http://host:8090/map/glyphs/{fontstack}/{range}.pbf`. */
  glyphs: string;
  /** Height wall rims are drawn at (metres); lower than the room blocks. */
  wallHeightMetres?: number;
  /**
   * Leave the room blocks out of the style: the renderer supplies them as its own source (phones,
   * where a source inside the style cannot be updated on its own). See `blocksLayer`.
   */
  dynamicBlocks?: boolean;
};
type Collection = FeatureCollection;
const collection = (features: Feature[]): Collection => ({
  type: 'FeatureCollection',
  features,
});

export const FONT_REGULAR = ['Inter Regular'];
export const FONT_SEMIBOLD = ['Inter SemiBold'];
export const FONT_BOLD = ['Inter Bold'];
/** Image ids the renderers register: one round badge per place category. */
export const categoryImageId = (category: string) => `cat-${category}`;
export const MAP_CATEGORIES = Object.keys(placeCategories);
/** Chevron drawn along the route, pointing the way to walk (white; registered by the renderers). */
export const ROUTE_ARROW_IMAGE = 'route-arrow';
/** The destination pin. */
export const DESTINATION_PIN_IMAGE = 'pin-dest';
/** Places drawn as icons; ordinary rooms are already named by their room label. */
const ICON_CATEGORIES = MAP_CATEGORIES.filter(
  (c) => c !== 'room' && c !== 'circulation' && c !== 'other',
);

const ring = (pts: P[], g: Georeference) => {
  const r = pts.map((p) => toLngLat(p, g));
  if (r.length) r.push(r[0]!);
  return r;
};

/** A wall segment as a thin rectangle, so it can be extruded. */
function wallPolygon(a: P, b: P, thickness: number): P[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (thickness / 2);
  const ny = (dx / len) * (thickness / 2);
  // Extend slightly along the wall so corners close.
  const ex = (dx / len) * (thickness / 2);
  const ey = (dy / len) * (thickness / 2);
  return [
    { x: a.x - ex + nx, y: a.y - ey + ny },
    { x: b.x + ex + nx, y: b.y + ey + ny },
    { x: b.x + ex - nx, y: b.y + ey - ny },
    { x: a.x - ex - nx, y: a.y - ey - ny },
  ];
}

/** Longitude/latitude bounds of a floor, for fitting the camera. */
export function sceneLngLatBounds(
  scene: Scene,
  g: Georeference,
): [[number, number], [number, number]] {
  const b = scene.bounds;
  const corners = [
    toLngLat({ x: b.minX, y: b.minY }, g),
    toLngLat({ x: b.maxX, y: b.minY }, g),
    toLngLat({ x: b.maxX, y: b.maxY }, g),
    toLngLat({ x: b.minX, y: b.maxY }, g),
  ];
  return [
    [
      Math.min(...corners.map((c) => c[0])),
      Math.min(...corners.map((c) => c[1])),
    ],
    [
      Math.max(...corners.map((c) => c[0])),
      Math.max(...corners.map((c) => c[1])),
    ],
  ];
}

/**
 * Rooms drawn as low solid blocks: every block room except the ones that are `open` (their floor
 * shows instead) and the one that is `lifted` (drawn by the selection layer).
 */
export function blockData(
  scene: Scene,
  g: Georeference,
  open: Iterable<string> = [],
  lifted: string | null = null,
): Collection {
  const skip = new Set(open);
  if (lifted) skip.add(lifted);
  return collection(
    scene.rooms
      .filter((r) => r.block && !skip.has(r.id))
      .map((r): Feature => ({
        type: 'Feature',
        properties: {
          roomId: r.id,
          placeId: r.placeId ?? '',
          top: r.top,
          h: r.blockHeight,
        },
        geometry: { type: 'Polygon', coordinates: [ring(r.polygon, g)] },
      })),
  );
}

/**
 * The rooms that show their floor instead of a block: the room the walker stands in, every room
 * the route passes through, and any room named in `keep` (the destination). Sorted, so two results
 * can be compared cheaply.
 */
export function openRoomIds(
  scene: Scene,
  at: {
    user?: P | null;
    route?: P[] | null;
    keep?: (string | null | undefined)[];
  },
): string[] {
  const blocks = scene.rooms.filter((r) => r.block);
  const open = new Set<string>();
  for (const id of at.keep ?? [])
    if (id && blocks.some((r) => r.id === id)) open.add(id);
  const visit = (p: P) => {
    for (const r of blocks)
      if (!open.has(r.id) && pointInPolygon(p, r.polygon)) open.add(r.id);
  };
  if (at.user) visit(at.user);
  const route = at.route ?? [];
  for (let i = 0; i < route.length; i++) {
    const a = route[i]!;
    visit(a);
    const b = route[i + 1];
    if (!b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    for (let d = 0.75; d < len; d += 0.75)
      visit({
        x: a.x + ((b.x - a.x) * d) / len,
        y: a.y + ((b.y - a.y) * d) / len,
      });
  }
  return [...open].sort();
}

/** The block layer, also for renderers that keep the blocks in their own source. */
export function blocksLayer(): LayerSpecification {
  return {
    id: 'blocks',
    type: 'fill-extrusion',
    source: 'blocks',
    paint: {
      'fill-extrusion-color': ['get', 'top'],
      'fill-extrusion-height': ['get', 'h'],
      'fill-extrusion-base': 0,
      'fill-extrusion-vertical-gradient': true,
    },
  };
}
/** Where a renderer's own block layer goes in the style. */
export const BLOCKS_BEFORE = 'walls';

/** Static floor geometry as GeoJSON collections. */
export function sceneData(scene: Scene, g: Georeference) {
  const rooms = scene.rooms.map((r): Feature => ({
    type: 'Feature',
    id: r.id,
    properties: {
      roomId: r.id,
      placeId: r.placeId ?? '',
      kind: r.kind,
      fill: r.fill,
    },
    geometry: { type: 'Polygon', coordinates: [ring(r.polygon, g)] },
  }));
  const walls = scene.walls.map((w, i): Feature => ({
    type: 'Feature',
    id: i,
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [ring(wallPolygon(w.from, w.to, 0.16), g)],
    },
  }));
  const windows = scene.windows.map((w): Feature => ({
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: [toLngLat(w.from, g), toLngLat(w.to, g)],
    },
  }));
  const iconPlaces = new Set(
    scene.places
      .filter((p) => ICON_CATEGORIES.includes(p.category))
      .map((p) => p.id),
  );
  const labels = scene.rooms
    .filter(
      (r) =>
        r.name.trim() &&
        r.kind !== 'outdoor' &&
        // A room whose place has a badge is named under the badge instead.
        !(r.placeId && iconPlaces.has(r.placeId)),
    )
    .map((r): Feature => ({
      type: 'Feature',
      properties: {
        name: r.name.trim(),
        roomId: r.id,
        placeId: r.placeId ?? '',
        kind: r.kind,
        priority: r.priority,
      },
      geometry: {
        type: 'Point',
        coordinates: toLngLat(r.labelAnchor ?? centroid(r.polygon), g),
      },
    }));
  const places = scene.places
    .filter((p) => ICON_CATEGORIES.includes(p.category))
    .map((p): Feature => ({
      type: 'Feature',
      properties: {
        placeId: p.id,
        name: p.name,
        icon: categoryImageId(p.category),
        showName: true,
      },
      geometry: { type: 'Point', coordinates: toLngLat(p, g) },
    }));
  return {
    rooms: collection(rooms),
    blocks: blockData(scene, g),
    walls: collection(walls),
    windows: collection(windows),
    labels: collection(labels),
    places: collection(places),
  };
}

/** The floor's static style: ground, shadow, floors, blocks, wall rims, labels and place icons. */
export function buildMapStyle(
  scene: Scene,
  options: MapStyleOptions,
): StyleSpecification {
  const pal = scene.palette;
  const data = sceneData(scene, options.georef);
  const wallHeight = options.wallHeightMetres ?? WALL_HEIGHT;
  const layers: LayerSpecification[] = [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': pal.land },
    },
    // A soft ambient shadow around the building: a blurred line under the floor, which the floor
    // then covers everywhere except just outside the outline.
    {
      id: 'building-shadow',
      type: 'line',
      source: 'rooms',
      filter: ['!=', ['get', 'kind'], 'outdoor'],
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': pal.shadow,
        'line-width': [
          'interpolate',
          ['exponential', 1.7],
          ['zoom'],
          16,
          4,
          20,
          22,
          23,
          60,
        ],
        'line-blur': [
          'interpolate',
          ['exponential', 1.7],
          ['zoom'],
          16,
          3,
          20,
          16,
          23,
          44,
        ],
        'line-translate': [0, 3],
        'line-translate-anchor': 'viewport',
      },
    },
    {
      id: 'room-fill',
      type: 'fill',
      source: 'rooms',
      paint: { 'fill-color': ['get', 'fill'], 'fill-antialias': true },
    },
    {
      id: 'room-outline',
      type: 'line',
      source: 'rooms',
      filter: ['!=', ['get', 'kind'], 'outdoor'],
      paint: {
        'line-color': pal.extrusion,
        'line-width': ['interpolate', ['linear'], ['zoom'], 17, 0.5, 21, 1.2],
      },
    },
    {
      id: 'windows',
      type: 'line',
      source: 'windows',
      paint: {
        'line-color': pal.window,
        'line-width': [
          'interpolate',
          ['exponential', 2],
          ['zoom'],
          17,
          1,
          22,
          8,
        ],
      },
    },
    ...(options.dynamicBlocks ? [] : [blocksLayer()]),
    {
      id: 'walls',
      type: 'fill-extrusion',
      source: 'walls',
      paint: {
        'fill-extrusion-color': pal.wall,
        'fill-extrusion-height': wallHeight,
        'fill-extrusion-base': 0,
        'fill-extrusion-vertical-gradient': true,
      },
    },
    {
      id: 'room-labels',
      type: 'symbol',
      source: 'labels',
      minzoom: 17,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': FONT_SEMIBOLD,
        'text-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          17.5,
          ['match', ['get', 'kind'], 'circulation', 9, 10],
          21,
          ['match', ['get', 'kind'], 'circulation', 11.5, 14],
        ],
        'text-max-width': 7,
        'text-line-height': 1.15,
        'text-padding': 4,
        'symbol-sort-key': ['get', 'priority'],
        'text-letter-spacing': [
          'match',
          ['get', 'kind'],
          'circulation',
          0.14,
          0.01,
        ],
        'text-transform': [
          'match',
          ['get', 'kind'],
          'circulation',
          'uppercase',
          'none',
        ],
      },
      paint: {
        'text-color': [
          'match',
          ['get', 'kind'],
          'circulation',
          pal.labelMuted,
          pal.label,
        ],
        'text-halo-color': pal.labelHalo,
        'text-halo-width': 1.6,
        'text-halo-blur': 0.5,
      },
    },
    {
      id: 'place-icons',
      type: 'symbol',
      source: 'places',
      minzoom: 16.5,
      layout: {
        'icon-image': ['get', 'icon'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 17, 0.46, 21, 0.78],
        'icon-allow-overlap': false,
        'icon-padding': 3,
        'text-field': ['case', ['get', 'showName'], ['get', 'name'], ''],
        'text-font': FONT_SEMIBOLD,
        'text-size': ['interpolate', ['linear'], ['zoom'], 18, 9.5, 21, 12.5],
        'text-anchor': 'top',
        'text-offset': [0, 1.15],
        'text-max-width': 7,
        'text-optional': true,
      },
      paint: {
        'text-color': pal.label,
        'text-halo-color': pal.labelHalo,
        'text-halo-width': 1.6,
        'text-halo-blur': 0.5,
      },
    },
  ];
  return {
    version: 8,
    name: `${scene.venueId}/${scene.floorId}`,
    glyphs: options.glyphs,
    light: {
      anchor: 'viewport',
      color: '#ffffff',
      intensity: 0.42,
      position: [1.2, 215, 38],
    },
    sources: {
      rooms: { type: 'geojson', data: data.rooms },
      ...(options.dynamicBlocks
        ? {}
        : { blocks: { type: 'geojson' as const, data: data.blocks } }),
      walls: { type: 'geojson', data: data.walls },
      windows: { type: 'geojson', data: data.windows },
      labels: { type: 'geojson', data: data.labels },
      places: { type: 'geojson', data: data.places },
    },
    layers,
  };
}

const routeWidth = (at17: number, at22: number) =>
  [
    'interpolate',
    ['exponential', 1.6],
    ['zoom'],
    17,
    at17,
    22,
    at22,
  ] as unknown as number;

/** Layers for the changing sources, drawn under the labels (route, selection) or on top (dot). */
export function dynamicLayers(pal: MapPalette) {
  const under: LayerSpecification[] = [
    // A selected place: its room lifts above the others in the accent colour.
    {
      id: 'selection-lift',
      type: 'fill-extrusion',
      source: 'selection',
      filter: ['==', ['get', 'style'], 'lift'],
      paint: {
        'fill-extrusion-color': pal.route,
        'fill-extrusion-height': LIFT_HEIGHT,
        'fill-extrusion-base': 0,
        'fill-extrusion-vertical-gradient': true,
      },
    },
    // A destination being walked to: its floor shows, tinted, with an accent outline.
    {
      id: 'selection-fill',
      type: 'fill',
      source: 'selection',
      filter: ['==', ['get', 'style'], 'floor'],
      paint: { 'fill-color': pal.roomSelected },
    },
    {
      id: 'selection-outline',
      type: 'line',
      source: 'selection',
      filter: ['==', ['get', 'style'], 'floor'],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': pal.route, 'line-width': 2.5 },
    },
    {
      id: 'route-casing',
      type: 'line',
      source: 'route',
      filter: ['==', ['get', 'part'], 'ahead'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': pal.routeCasing,
        'line-width': routeWidth(6.5, 19),
      },
    },
    {
      id: 'route-walked',
      type: 'line',
      source: 'route',
      filter: ['==', ['get', 'part'], 'walked'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': pal.routeWalked,
        'line-width': routeWidth(3, 9),
      },
    },
    {
      id: 'route-line',
      type: 'line',
      source: 'route',
      filter: ['==', ['get', 'part'], 'ahead'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': pal.route,
        'line-width': routeWidth(4, 13),
      },
    },
    {
      id: 'route-arrows',
      type: 'symbol',
      source: 'route',
      filter: ['==', ['get', 'part'], 'ahead'],
      minzoom: 18.5,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': [
          'interpolate',
          ['linear'],
          ['zoom'],
          18.5,
          36,
          22,
          64,
        ],
        'icon-image': ROUTE_ARROW_IMAGE,
        'icon-size': ['interpolate', ['linear'], ['zoom'], 18.5, 0.32, 22, 0.6],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-rotation-alignment': 'map',
        'icon-pitch-alignment': 'map',
      },
      paint: { 'icon-opacity': 0.92 },
    },
  ];
  const over: LayerSpecification[] = [
    {
      id: 'markers',
      type: 'circle',
      source: 'markers',
      paint: {
        'circle-radius': 6,
        'circle-color': ['coalesce', ['get', 'color'], pal.beacon],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    },
    {
      id: 'marker-labels',
      type: 'symbol',
      source: 'markers',
      layout: {
        'text-field': ['get', 'text'],
        'text-font': FONT_SEMIBOLD,
        'text-size': 11,
        'text-anchor': 'top',
        'text-offset': [0, 0.9],
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': pal.label,
        'text-halo-color': pal.labelHalo,
        'text-halo-width': 1.5,
      },
    },
    {
      id: 'endpoints',
      type: 'circle',
      source: 'endpoints',
      filter: ['==', ['get', 'role'], 'start'],
      paint: {
        'circle-radius': 5.5,
        'circle-color': '#ffffff',
        'circle-stroke-color': pal.route,
        'circle-stroke-width': 3,
      },
    },
    {
      id: 'endpoint-pin',
      type: 'symbol',
      source: 'endpoints',
      filter: ['==', ['get', 'role'], 'end'],
      layout: {
        'icon-image': DESTINATION_PIN_IMAGE,
        'icon-size': 0.9,
        'icon-anchor': 'bottom',
        // The tip rests on top of the place badge at the same point.
        'icon-offset': [0, -11],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    },
    {
      id: 'user-accuracy',
      type: 'fill',
      source: 'user',
      filter: ['==', ['get', 'part'], 'accuracy'],
      paint: {
        'fill-color': pal.dot,
        'fill-opacity': ['case', ['get', 'live'], 0.12, 0.07],
        'fill-outline-color': pal.dot,
      },
    },
    // The direction beam: a wide faint cone with a brighter core, so it fades at the edges.
    {
      id: 'user-heading',
      type: 'fill',
      source: 'user',
      filter: ['==', ['get', 'part'], 'heading'],
      paint: { 'fill-color': pal.dot, 'fill-opacity': 0.16 },
    },
    {
      id: 'user-heading-core',
      type: 'fill',
      source: 'user',
      filter: ['==', ['get', 'part'], 'heading-core'],
      paint: { 'fill-color': pal.dot, 'fill-opacity': 0.22 },
    },
    {
      id: 'user-shadow',
      type: 'circle',
      source: 'user',
      filter: ['==', ['get', 'part'], 'dot'],
      paint: {
        'circle-radius': 13,
        'circle-color': '#0B1220',
        'circle-opacity': 0.22,
        'circle-blur': 0.7,
        'circle-translate': [0, 2],
      },
    },
    // Constant on screen (Plan 005 §4.3): a round dot facing the viewer at every tilt.
    {
      id: 'user-dot',
      type: 'circle',
      source: 'user',
      filter: ['==', ['get', 'part'], 'dot'],
      paint: {
        'circle-radius': 8,
        'circle-color': ['case', ['get', 'live'], pal.dot, '#8A93A6'],
        'circle-stroke-color': pal.dotRing,
        'circle-stroke-width': 3,
      },
    },
  ];
  return { under, over, beforeId: 'room-labels' };
}

export const emptyCollection = (): Collection => collection([]);

/** The route split at the walker: the part ahead (blue) and the part walked (muted). */
export function routeData(
  route: P[] | null,
  walkedMetres: number,
  g: Georeference,
): Collection {
  if (!route || route.length < 2) return collection([]);
  const ahead: P[] = [];
  const walked: P[] = [];
  let acc = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i]!;
    const b = route[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + len <= walkedMetres) {
      if (!walked.length) walked.push(a);
      walked.push(b);
    } else if (acc >= walkedMetres) {
      if (!ahead.length) ahead.push(a);
      ahead.push(b);
    } else {
      const t = (walkedMetres - acc) / len;
      const m = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (!walked.length) walked.push(a);
      walked.push(m);
      ahead.push(m, b);
    }
    acc += len;
  }
  const line = (pts: P[], part: string): Feature[] =>
    pts.length > 1
      ? [
          {
            type: 'Feature',
            properties: { part },
            geometry: {
              type: 'LineString',
              coordinates: pts.map((p) => toLngLat(p, g)),
            },
          },
        ]
      : [];
  return collection([...line(walked, 'walked'), ...line(ahead, 'ahead')]);
}

/** Start and end of the route. */
export function endpointData(
  start: P | null,
  end: P | null,
  g: Georeference,
): Collection {
  const f: Feature[] = [];
  if (start)
    f.push({
      type: 'Feature',
      properties: { role: 'start' },
      geometry: { type: 'Point', coordinates: toLngLat(start, g) },
    });
  if (end)
    f.push({
      type: 'Feature',
      properties: { role: 'end' },
      geometry: { type: 'Point', coordinates: toLngLat(end, g) },
    });
  return collection(f);
}

/**
 * The selected room. `lift`: a place being looked at rises in the accent colour. `floor`: a
 * destination being walked to shows its floor, tinted and outlined.
 */
export function selectionData(
  scene: Scene,
  roomId: string | null,
  g: Georeference,
  style: 'lift' | 'floor' = 'lift',
): Collection {
  const room = roomId ? scene.rooms.find((r) => r.id === roomId) : undefined;
  if (!room) return collection([]);
  return collection([
    {
      type: 'Feature',
      properties: { style: room.block ? style : 'floor', roomId: room.id },
      geometry: { type: 'Polygon', coordinates: [ring(room.polygon, g)] },
    },
  ]);
}

/** Markers such as placed beacons. */
export function markerData(
  markers: {
    key: string;
    x: number;
    y: number;
    text: string;
    color?: string;
  }[],
  g: Georeference,
): Collection {
  return collection(
    markers.map((m) => ({
      type: 'Feature',
      properties: { key: m.key, text: m.text, color: m.color ?? null },
      geometry: { type: 'Point', coordinates: toLngLat(m, g) },
    })),
  );
}

/** Uncertainty disc limits in metres (Plan 005 §4.4). */
export const ACCURACY_MIN_METRES = 1;
export const ACCURACY_MAX_METRES = 8;

/**
 * The blue dot: an accuracy disc of radius `sigma` metres, a direction beam when the heading is
 * known (wider when the heading is less certain), and the dot itself.
 */
export function userData(
  user: {
    x: number;
    y: number;
    sigma: number;
    heading: number | null;
    live: boolean;
    /** Heading uncertainty (rad, one standard deviation); widens the beam. */
    headingSigma?: number;
  } | null,
  g: Georeference,
): Collection {
  if (!user) return collection([]);
  const f: Feature[] = [];
  const sigma = Math.max(
    ACCURACY_MIN_METRES,
    Math.min(ACCURACY_MAX_METRES, user.sigma),
  );
  const circle: P[] = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    circle.push({
      x: user.x + Math.cos(a) * sigma,
      y: user.y + Math.sin(a) * sigma,
    });
  }
  f.push({
    type: 'Feature',
    properties: { part: 'accuracy', live: user.live },
    geometry: { type: 'Polygon', coordinates: [ring(circle, g)] },
  });
  if (user.heading !== null) {
    const heading = user.heading;
    const half = Math.max(0.3, Math.min(0.8, 0.3 + (user.headingSigma ?? 0)));
    const cone = (length: number, halfAngle: number, part: string) => {
      const pts: P[] = [{ x: user.x, y: user.y }];
      for (let i = 0; i <= 10; i++) {
        const a = heading - halfAngle + (i / 10) * halfAngle * 2;
        pts.push({
          x: user.x + Math.cos(a) * length,
          y: user.y + Math.sin(a) * length,
        });
      }
      f.push({
        type: 'Feature',
        properties: { part, live: user.live },
        geometry: { type: 'Polygon', coordinates: [ring(pts, g)] },
      });
    };
    const length = Math.max(2.4, Math.min(4.5, sigma * 1.4));
    cone(length, half, 'heading');
    cone(length * 0.72, half * 0.62, 'heading-core');
  }
  f.push({
    type: 'Feature',
    properties: { part: 'dot', live: user.live },
    geometry: { type: 'Point', coordinates: toLngLat(user, g) },
  });
  return collection(f);
}

/** Badge colour of a place category (for the renderers' icon images). */
export const categoryColor = (category: string) =>
  categoryColors[category as keyof typeof categoryColors] ?? '#6E7787';

/** Dynamic source ids, in the order the renderers keep them. */
export const DYNAMIC_SOURCES = [
  'selection',
  'route',
  'markers',
  'endpoints',
  'user',
] as const;
export type DynamicSource = (typeof DYNAMIC_SOURCES)[number];

/**
 * The static style plus empty dynamic sources and their layers in drawing order (route and
 * selection under the labels, markers and the dot on top), for renderers that hold one style.
 */
export function composeStyle(
  base: StyleSpecification,
  pal: MapPalette,
  data: Partial<Record<DynamicSource, FeatureCollection>> = {},
): StyleSpecification {
  const { under, over, beforeId } = dynamicLayers(pal);
  const at = base.layers.findIndex((l) => l.id === beforeId);
  const layers = [...base.layers];
  layers.splice(at < 0 ? layers.length : at, 0, ...under);
  layers.push(...over);
  const sources = { ...base.sources };
  for (const id of DYNAMIC_SOURCES)
    sources[id] = { type: 'geojson', data: data[id] ?? emptyCollection() };
  return { ...base, sources, layers };
}

import type {
  LayerSpecification,
  StyleSpecification,
} from '@maplibre/maplibre-gl-style-spec';
import type { Feature, FeatureCollection } from 'geojson';
import type { MapPalette } from '@turn/design';
import { categoryColors, placeCategories } from '@turn/design';
import { toLngLat, type Georeference } from './geo';
import { centroid, type P, type Scene } from './scene';

/**
 * One MapLibre description of a venue floor (ADR-0013), shared by the phone map, the web map and
 * TURN Studio. Static geometry lives in the style; the route, selection, markers and the blue dot
 * are separate sources the renderers update (`dynamicLayers` and the `*Data` builders).
 */
export type MapStyleOptions = {
  georef: Georeference;
  /** MapLibre glyph URL template, e.g. `http://host:8090/map/glyphs/{fontstack}/{range}.pbf`. */
  glyphs: string;
  /** Height walls are drawn at (metres); low enough to see into rooms when the map is tilted. */
  wallHeightMetres?: number;
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
      coordinates: [ring(wallPolygon(w.from, w.to, 0.18), g)],
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
  const labels = scene.rooms
    .filter((r) => r.name.trim() && r.kind !== 'outdoor')
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
        // Named by the room label already when the place fills a room of the same name.
        showName: !scene.rooms.some(
          (r) => r.id === p.roomId && r.name === p.name,
        ),
      },
      geometry: { type: 'Point', coordinates: toLngLat(p, g) },
    }));
  return {
    rooms: collection(rooms),
    walls: collection(walls),
    windows: collection(windows),
    labels: collection(labels),
    places: collection(places),
  };
}

/** The floor's static style: background, rooms, walls, windows, labels and place icons. */
export function buildMapStyle(
  scene: Scene,
  options: MapStyleOptions,
): StyleSpecification {
  const pal = scene.palette;
  const data = sceneData(scene, options.georef);
  const wallHeight = options.wallHeightMetres ?? 2.4;
  const layers: LayerSpecification[] = [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': pal.land },
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
          10,
        ],
      },
    },
    {
      id: 'walls',
      type: 'fill-extrusion',
      source: 'walls',
      paint: {
        'fill-extrusion-color': pal.wall,
        'fill-extrusion-height': wallHeight,
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.92,
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
          ['match', ['get', 'kind'], 'circulation', 12, 14],
        ],
        'text-max-width': 7,
        'text-line-height': 1.15,
        'text-padding': 3,
        'symbol-sort-key': ['get', 'priority'],
        'text-letter-spacing': [
          'match',
          ['get', 'kind'],
          'circulation',
          0.12,
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
        'text-halo-width': 1.4,
        'text-halo-blur': 0.4,
      },
    },
    {
      id: 'place-icons',
      type: 'symbol',
      source: 'places',
      minzoom: 16.5,
      layout: {
        'icon-image': ['get', 'icon'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 17, 0.6, 21, 0.85],
        'icon-allow-overlap': false,
        'icon-padding': 2,
        'text-field': ['case', ['get', 'showName'], ['get', 'name'], ''],
        'text-font': FONT_SEMIBOLD,
        'text-size': ['interpolate', ['linear'], ['zoom'], 18, 9, 21, 12],
        'text-anchor': 'top',
        'text-offset': [0, 1.1],
        'text-max-width': 7,
        'text-optional': true,
      },
      paint: {
        'text-color': pal.label,
        'text-halo-color': pal.labelHalo,
        'text-halo-width': 1.4,
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
      intensity: 0.32,
      position: [1.3, 210, 35],
    },
    sources: {
      rooms: { type: 'geojson', data: data.rooms },
      walls: { type: 'geojson', data: data.walls },
      windows: { type: 'geojson', data: data.windows },
      labels: { type: 'geojson', data: data.labels },
      places: { type: 'geojson', data: data.places },
    },
    layers,
  };
}

/** Layers for the changing sources, drawn under the labels (route, selection) or on top (dot). */
export function dynamicLayers(pal: MapPalette) {
  const under: LayerSpecification[] = [
    {
      id: 'selection-fill',
      type: 'fill-extrusion',
      source: 'selection',
      paint: {
        'fill-extrusion-color': pal.route,
        'fill-extrusion-height': 0.25,
        'fill-extrusion-opacity': 0.22,
      },
    },
    {
      id: 'selection-outline',
      type: 'line',
      source: 'selection',
      paint: { 'line-color': pal.route, 'line-width': 2 },
    },
    {
      id: 'route-casing',
      type: 'line',
      source: 'route',
      filter: ['==', ['get', 'part'], 'ahead'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': pal.routeCasing,
        'line-width': [
          'interpolate',
          ['exponential', 1.6],
          ['zoom'],
          17,
          6,
          22,
          26,
        ],
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
        'line-width': [
          'interpolate',
          ['exponential', 1.6],
          ['zoom'],
          17,
          3,
          22,
          14,
        ],
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
        'line-width': [
          'interpolate',
          ['exponential', 1.6],
          ['zoom'],
          17,
          4,
          22,
          18,
        ],
      },
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
      paint: {
        'circle-radius': ['match', ['get', 'role'], 'end', 8, 6],
        'circle-color': ['match', ['get', 'role'], 'end', pal.pin, '#ffffff'],
        'circle-stroke-color': [
          'match',
          ['get', 'role'],
          'end',
          '#ffffff',
          pal.route,
        ],
        'circle-stroke-width': 3,
        'circle-pitch-alignment': 'map',
      },
    },
    {
      id: 'user-accuracy',
      type: 'fill',
      source: 'user',
      filter: ['==', ['get', 'part'], 'accuracy'],
      paint: {
        'fill-color': pal.dot,
        'fill-opacity': ['case', ['get', 'live'], 0.13, 0.08],
        'fill-outline-color': pal.dot,
      },
    },
    {
      id: 'user-heading',
      type: 'fill',
      source: 'user',
      filter: ['==', ['get', 'part'], 'heading'],
      paint: { 'fill-color': pal.dot, 'fill-opacity': 0.28 },
    },
    {
      id: 'user-dot',
      type: 'circle',
      source: 'user',
      filter: ['==', ['get', 'part'], 'dot'],
      paint: {
        'circle-radius': 7.5,
        'circle-color': ['case', ['get', 'live'], pal.dot, '#8A93A6'],
        'circle-stroke-color': pal.dotRing,
        'circle-stroke-width': 3,
        'circle-pitch-alignment': 'map',
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

/** The selected room outline, raised slightly and tinted. */
export function selectionData(
  scene: Scene,
  roomId: string | null,
  g: Georeference,
): Collection {
  const room = roomId ? scene.rooms.find((r) => r.id === roomId) : undefined;
  if (!room) return collection([]);
  return collection([
    {
      type: 'Feature',
      properties: {},
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

/**
 * The blue dot: an accuracy circle of radius `sigma` metres, a heading cone when the direction is
 * known, and the dot itself. All in metres on the floor, so they scale with the map.
 */
export function userData(
  user: {
    x: number;
    y: number;
    sigma: number;
    heading: number | null;
    live: boolean;
  } | null,
  g: Georeference,
): Collection {
  if (!user) return collection([]);
  const f: Feature[] = [];
  const sigma = Math.max(0.6, user.sigma);
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
    const length = Math.max(2.2, Math.min(5, sigma * 1.4));
    const half = 0.42;
    const cone: P[] = [{ x: user.x, y: user.y }];
    for (let i = 0; i <= 8; i++) {
      const a = user.heading - half + (i / 8) * half * 2;
      cone.push({
        x: user.x + Math.cos(a) * length,
        y: user.y + Math.sin(a) * length,
      });
    }
    f.push({
      type: 'Feature',
      properties: { part: 'heading', live: user.live },
      geometry: { type: 'Polygon', coordinates: [ring(cone, g)] },
    });
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

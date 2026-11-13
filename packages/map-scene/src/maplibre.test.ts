import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import { darkMap, lightMap } from '@turn/design';
import { demoCentre } from '@turn/venue-model';
import {
  bearingToHeading,
  fromLngLat,
  headingToBearing,
  metresPerPixel,
  toLngLat,
  zoomForMetresPerPixel,
  type Georeference,
} from './geo';
import {
  blockData,
  buildMapStyle,
  composeStyle,
  openRoomIds,
  routeData,
  sceneLngLatBounds,
  selectionData,
  userData,
} from './maplibre';
import { buildScene } from './scene';
import type { LineString } from 'geojson';

const campus: Georeference = { lat: 33.656, lon: 73.0136, bearingDeg: 37 };

describe('georeference', () => {
  it('round-trips venue metres through longitude and latitude to the millimetre', () => {
    for (const p of [
      { x: 0, y: 0 },
      { x: 120.5, y: -48.25 },
      { x: -300, y: 410 },
    ]) {
      const back = fromLngLat(toLngLat(p, campus), campus);
      expect(back.x).toBeCloseTo(p.x, 3);
      expect(back.y).toBeCloseTo(p.y, 3);
    }
  });
  it('puts the map +y axis at the venue bearing', () => {
    // 10 m along +y with the map turned 90° clockwise points east: longitude grows, latitude not.
    const g = { lat: 0, lon: 0, bearingDeg: 90 };
    const [lon, lat] = toLngLat({ x: 0, y: 10 }, g);
    expect(lon).toBeGreaterThan(0);
    expect(Math.abs(lat)).toBeLessThan(1e-9);
  });
  it('converts headings and compass bearings both ways', () => {
    expect(headingToBearing(Math.PI / 2, campus)).toBeCloseTo(37); // +y
    expect(headingToBearing(0, campus)).toBeCloseTo(127); // +x is 90° clockwise of +y
    for (const h of [-2.5, -0.3, 0, 1.2, 3])
      expect(bearingToHeading(headingToBearing(h, campus), campus)).toBeCloseTo(
        h,
      );
  });
  it('relates zoom and metres per pixel', () => {
    const z = zoomForMetresPerPixel(0.05, campus.lat);
    expect(metresPerPixel(z, campus.lat)).toBeCloseTo(0.05, 6);
  });
});

describe('MapLibre style', () => {
  for (const [name, palette] of [
    ['light', lightMap],
    ['dark', darkMap],
  ] as const)
    it(`is a valid MapLibre style for every demo floor (${name})`, () => {
      for (const floor of demoCentre.floors) {
        const scene = buildScene(demoCentre, floor.id, palette);
        const style = composeStyle(
          buildMapStyle(scene, {
            georef: campus,
            glyphs: 'http://localhost/map/glyphs/{fontstack}/{range}.pbf',
          }),
          palette,
        );
        expect(validateStyleMin(style as never)).toEqual([]);
        // The route and selection draw under the labels; the dot on top of everything.
        const ids = style.layers.map((l) => l.id);
        expect(ids.indexOf('route-line')).toBeLessThan(
          ids.indexOf('room-labels'),
        );
        expect(ids.at(-1)).toBe('user-dot');
      }
    });
  it('bounds contain every room corner', () => {
    const scene = buildScene(demoCentre, demoCentre.floors[0]!.id, lightMap);
    const [[w, s], [e, n]] = sceneLngLatBounds(scene, campus);
    for (const r of scene.rooms)
      for (const p of r.polygon) {
        const [lon, lat] = toLngLat(p, campus);
        expect(lon).toBeGreaterThanOrEqual(w - 1e-9);
        expect(lon).toBeLessThanOrEqual(e + 1e-9);
        expect(lat).toBeGreaterThanOrEqual(s - 1e-9);
        expect(lat).toBeLessThanOrEqual(n + 1e-9);
      }
  });
  it('splits the route at the distance walked', () => {
    const route = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    const parts = routeData(route, 4, campus).features;
    expect(parts.map((f) => f.properties!.part)).toEqual(['walked', 'ahead']);
    const ahead = parts[1]!.geometry as LineString;
    const start = fromLngLat(ahead.coordinates[0] as [number, number], campus);
    expect(start.x).toBeCloseTo(4, 3);
    expect(routeData(route, 0, campus).features).toHaveLength(1);
    expect(routeData(route, 25, campus).features[0]!.properties!.part).toBe(
      'walked',
    );
  });
  it('draws the dot with an accuracy circle, and a cone only when the heading is known', () => {
    const parts = (heading: number | null) =>
      userData(
        { x: 3, y: 4, sigma: 2, heading, live: true },
        campus,
      ).features.map((f) => f.properties!.part);
    expect(parts(0.5)).toEqual(['accuracy', 'heading', 'heading-core', 'dot']);
    expect(parts(null)).toEqual(['accuracy', 'dot']);
    expect(userData(null, campus).features).toEqual([]);
  });
  it('keeps the uncertainty disc between 1 m and 8 m, and widens the beam when unsure', () => {
    const radius = (sigma: number) => {
      const ring = (
        userData({ x: 0, y: 0, sigma, heading: null, live: true }, campus)
          .features[0]!.geometry as unknown as {
          coordinates: [number, number][][];
        }
      ).coordinates[0]!;
      const p = fromLngLat(ring[0]!, campus);
      return Math.hypot(p.x, p.y);
    };
    expect(radius(0.2)).toBeCloseTo(1, 2);
    expect(radius(3)).toBeCloseTo(3, 2);
    expect(radius(40)).toBeCloseTo(8, 2);
    const width = (headingSigma: number) => {
      const ring = (
        userData(
          { x: 0, y: 0, sigma: 2, heading: 0, live: true, headingSigma },
          campus,
        ).features[1]!.geometry as unknown as {
          coordinates: [number, number][][];
        }
      ).coordinates[0]!;
      const a = fromLngLat(ring[1]!, campus);
      return Math.abs(Math.atan2(a.y, a.x));
    };
    expect(width(0.6)).toBeGreaterThan(width(0));
  });
  it('draws rooms as blocks, except open and lifted ones', () => {
    const scene = buildScene(demoCentre, 'ground', lightMap);
    const all = blockData(scene, campus).features.map(
      (f) => f.properties!.roomId as string,
    );
    expect(all).toContain('cafe');
    expect(all).not.toContain('corridor');
    const some = blockData(scene, campus, ['cafe'], 'books').features.map(
      (f) => f.properties!.roomId as string,
    );
    expect(some).not.toContain('cafe');
    expect(some).not.toContain('books');
    expect(some.length).toBe(all.length - 2);
    // Without blocks in the style, phones supply them as their own source.
    const style = buildMapStyle(scene, {
      georef: campus,
      glyphs: 'http://localhost/{fontstack}/{range}.pbf',
      dynamicBlocks: true,
    });
    expect(style.sources.blocks).toBeUndefined();
    expect(style.layers.some((l) => l.id === 'blocks')).toBe(false);
  });
  it('opens the room the walker is in, rooms on the route and the destination', () => {
    const scene = buildScene(demoCentre, 'ground', lightMap);
    const cafe = scene.rooms.find((r) => r.id === 'cafe')!;
    const inside = {
      x: cafe.polygon.reduce((s, p) => s + p.x, 0) / cafe.polygon.length,
      y: cafe.polygon.reduce((s, p) => s + p.y, 0) / cafe.polygon.length,
    };
    expect(openRoomIds(scene, {})).toEqual([]);
    expect(openRoomIds(scene, { user: inside })).toEqual(['cafe']);
    expect(openRoomIds(scene, { keep: ['books', null, 'corridor'] })).toEqual([
      'books',
    ]);
    // A route that only crosses a room between its points still opens it.
    const through = openRoomIds(scene, {
      route: [
        { x: inside.x - 30, y: inside.y },
        { x: inside.x + 30, y: inside.y },
      ],
    });
    expect(through).toContain('cafe');
  });
  it('lifts a selected block and tints a destination floor', () => {
    const scene = buildScene(demoCentre, 'ground', lightMap);
    const style = (room: string, s?: 'lift' | 'floor') =>
      selectionData(scene, room, campus, s).features[0]!.properties!.style;
    expect(style('cafe')).toBe('lift');
    expect(style('cafe', 'floor')).toBe('floor');
    // Open floor cannot lift.
    expect(style('corridor', 'lift')).toBe('floor');
  });
});

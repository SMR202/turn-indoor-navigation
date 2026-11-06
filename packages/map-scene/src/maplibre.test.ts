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
  buildMapStyle,
  composeStyle,
  routeData,
  sceneLngLatBounds,
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
    expect(parts(0.5)).toEqual(['accuracy', 'heading', 'dot']);
    expect(parts(null)).toEqual(['accuracy', 'dot']);
    expect(userData(null, campus).features).toEqual([]);
  });
});

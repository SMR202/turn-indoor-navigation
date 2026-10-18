import { describe, expect, it } from 'vitest';
import { importFloorGeoJson, type TurnFloorGeoJson } from './geojson-import';
import { wallCrossings } from './geometry';

// Pixel plan 600 x 300 px at 0.02 m/px (12 x 6 m): office A and B north of a corridor, door gaps on
// the corridor wall, image y pointing down.
const px = (x: number, y: number): [number, number] => [x, y];
const plan: TurnFloorGeoJson = {
  type: 'FeatureCollection',
  turn: { units: 'pixels', metresPerPixel: 0.02, imageHeight: 300 },
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [px(0, 0), px(300, 0), px(300, 150), px(0, 150), px(0, 0)],
        ],
      },
      properties: { kind: 'room', name: 'Office A', category: 'meeting' },
    },
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[px(300, 0), px(600, 0), px(600, 150), px(300, 150)]],
      },
      properties: { kind: 'room', name: 'Kitchenette' },
    },
    {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[px(0, 150), px(600, 150), px(600, 300), px(0, 300)]],
      },
      properties: { kind: 'circulation', name: 'Corridor' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: px(150, 150) },
      properties: { kind: 'door' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: px(450, 150) },
      properties: { kind: 'door' },
    },
  ],
};

describe('TURN Floor GeoJSON import', () => {
  it('converts pixels to metres, derives walls with door gaps and builds a routable graph', () => {
    const { venue, report } = importFloorGeoJson(plan, {
      venueId: 'office',
      name: 'Office',
    });
    expect(venue.floors[0]!.widthMetres).toBe(12);
    expect(venue.floors[0]!.heightMetres).toBe(6);
    const officeA = venue.floors[0]!.rooms.find((r) => r.name === 'Office A')!;
    expect(officeA.polygon.some((p) => p.x === 0 && p.y === 6)).toBe(true); // y flipped
    expect(report.wallsDerived).toBe(true);
    expect(report.doors).toBe(2);
    expect(wallCrossings(venue)).toEqual([]);
    expect(report.unreachablePlaces).toEqual([]);
    expect(venue.pois.map((p) => p.name).sort()).toEqual([
      'Kitchenette',
      'Office A',
    ]);
    // Door gap: no wall segment covers the door point on the corridor wall.
    const door = venue.floors[0]!.doors[0]!.position;
    const covered = venue.floors[0]!.walls.some((w) => {
      const minX = Math.min(w.from.x, w.to.x),
        maxX = Math.max(w.from.x, w.to.x);
      return (
        w.from.y === door.y &&
        w.to.y === door.y &&
        door.x > minX &&
        door.x < maxX
      );
    });
    expect(covered).toBe(false);
  });
  it('reports what is missing instead of failing silently', () => {
    const noDoors = {
      ...plan,
      features: plan.features.filter((f) => f.properties?.kind !== 'door'),
    };
    const { report } = importFloorGeoJson(noDoors, { venueId: 'x', name: 'X' });
    expect(report.warnings.join(' ')).toMatch(/No doors/);
    expect(() =>
      importFloorGeoJson(
        { type: 'FeatureCollection', features: [] },
        { venueId: 'x', name: 'X' },
      ),
    ).toThrow(/No room polygons/);
  });
});

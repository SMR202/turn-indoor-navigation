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

describe('corridors that bend', () => {
  const m = (x: number, y: number): [number, number] => [x, y];
  // A U-shaped corridor (three legs, 4 m wide) with a room at the end of each arm.
  const u: TurnFloorGeoJson = {
    type: 'FeatureCollection',
    turn: { units: 'metres' },
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              m(0, 0),
              m(30, 0),
              m(30, 20),
              m(26, 20),
              m(26, 4),
              m(4, 4),
              m(4, 20),
              m(0, 20),
            ],
          ],
        },
        properties: { kind: 'circulation', name: 'Corridor', id: 'corridor' },
      },
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[m(0, 20), m(4, 20), m(4, 26), m(0, 26)]],
        },
        properties: { kind: 'room', name: 'West Room', id: 'west' },
      },
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[m(26, 20), m(30, 20), m(30, 26), m(26, 26)]],
        },
        properties: { kind: 'room', name: 'East Room', id: 'east' },
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: m(2, 20) },
        properties: { kind: 'door', id: 'dw' },
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: m(28, 20) },
        properties: { kind: 'door', id: 'de' },
      },
    ],
  };
  it('routes round the corners instead of leaving the far room unreachable', () => {
    const { venue, report } = importFloorGeoJson(u, {
      venueId: 'u',
      name: 'U',
    });
    expect(report.unreachablePlaces).toEqual([]);
    expect(wallCrossings(venue)).toEqual([]);
    // A node sits just inside each of the two inward corners.
    const cornerNodes = venue.nodes.filter((n) => /-c\d+$/.test(n.id));
    expect(cornerNodes).toHaveLength(2);
    // West to east is connected through them.
    const adj = new Map<string, string[]>();
    for (const e of venue.edges) {
      adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
      adj.set(e.to, [...(adj.get(e.to) ?? []), e.from]);
    }
    const seen = new Set(['n-west']);
    const queue = ['n-west'];
    while (queue.length)
      for (const n of adj.get(queue.shift()!) ?? [])
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
    expect(seen.has('n-east')).toBe(true);
    for (const c of cornerNodes) expect(seen.has(c.id)).toBe(true);
  });
});

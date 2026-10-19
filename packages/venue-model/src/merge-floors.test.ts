import { describe, expect, it } from 'vitest';
import { importFloorGeoJson, type TurnFloorGeoJson } from './geojson-import';
import { linkVerticalCores, mergeFloor } from './merge-floors';

const poly = (x0: number, y0: number, x1: number, y1: number) => [
  [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ],
];
// A small floor: hall along the south, a shop and a stairs-and-lift core to the north (metres).
const floor = (shop: string): TurnFloorGeoJson =>
  ({
    type: 'FeatureCollection',
    turn: { units: 'metres' },
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: poly(0, 0, 20, 4) },
        properties: { kind: 'circulation', name: 'Hall' },
      },
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: poly(0, 4, 12, 10) },
        properties: { name: shop },
      },
      {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: poly(12, 4, 20, 10) },
        properties: { kind: 'stairs', name: 'Stairs & Lift' },
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [6, 4] },
        properties: { kind: 'door' },
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [16, 4] },
        properties: { kind: 'door' },
      },
    ],
  }) as TurnFloorGeoJson;

describe('multi-floor import', () => {
  const ground = importFloorGeoJson(floor('Bakery'), {
    venueId: 'v',
    name: 'V',
    floorId: 'g',
  }).venue;
  const upper = importFloorGeoJson(floor('Bookshop'), {
    venueId: 'v',
    name: 'V',
    floorId: 'u',
  }).venue;

  it('adds floors, links the shared core with stairs and a step-free lift', () => {
    const a = mergeFloor(null, ground, {
      floorId: 'ground',
      label: 'Ground',
      level: 0,
    });
    const b = mergeFloor(a.venue, upper, {
      floorId: 'level-1',
      label: 'Level 1',
      level: 1,
    });
    expect(b.venue.floors.map((f) => f.label)).toEqual(['Ground', 'Level 1']);
    expect(b.links).toBe(2);
    expect(b.venue.connectors.map((c) => c.kind).sort()).toEqual([
      'lift',
      'stairs',
    ]);
    const lift = b.venue.edges.find((e) => e.connectorId?.includes('lift'))!;
    expect(lift.stepFree).toBe(true);
    expect(
      b.venue.edges.find((e) => e.connectorId?.includes('stairs'))!.stepFree,
    ).toBe(false);
    expect(new Set(b.venue.nodes.map((n) => n.id)).size).toBe(
      b.venue.nodes.length,
    );
    expect(b.venue.pois.map((p) => p.name).sort()).toEqual([
      'Bakery',
      'Bookshop',
      'Stairs & Lift',
      'Stairs & Lift',
    ]);
  });

  it('replaces a floor in place and keeps the other floor and its links valid', () => {
    const a = mergeFloor(null, ground, {
      floorId: 'ground',
      label: 'Ground',
      level: 0,
    });
    const b = mergeFloor(a.venue, upper, {
      floorId: 'level-1',
      label: 'Level 1',
      level: 1,
    });
    const again = importFloorGeoJson(floor('Toy Shop'), {
      venueId: 'v',
      name: 'V',
      floorId: 'x',
    }).venue;
    const c = mergeFloor(b.venue, again, {
      floorId: 'level-1',
      label: 'Level 1',
      level: 1,
    });
    expect(c.venue.floors).toHaveLength(2);
    expect(c.venue.pois.some((p) => p.name === 'Bookshop')).toBe(false);
    expect(c.venue.pois.some((p) => p.name === 'Toy Shop')).toBe(true);
    expect(c.venue.connectors).toHaveLength(2);
    // Linking twice adds nothing.
    expect(linkVerticalCores(c.venue).links).toBe(0);
  });

  it('warns about a stairs room with nothing below it', () => {
    const a = mergeFloor(null, ground, {
      floorId: 'ground',
      label: 'Ground',
      level: 0,
    });
    const far = importFloorGeoJson(
      {
        ...floor('Gallery'),
        features: floor('Gallery').features.map((f) =>
          f.properties?.kind === 'stairs'
            ? {
                ...f,
                properties: { kind: 'stairs', name: 'North stairs' },
                geometry: { type: 'Polygon', coordinates: poly(0, 10, 4, 14) },
              }
            : f,
        ),
      } as TurnFloorGeoJson,
      { venueId: 'v', name: 'V', floorId: 'u' },
    ).venue;
    const b = mergeFloor(a.venue, far, {
      floorId: 'level-1',
      label: 'Level 1',
      level: 1,
    });
    expect(b.links).toBe(0);
    expect(b.warnings.join(' ')).toMatch(/no stairs or lift below/);
  });
});

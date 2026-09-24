import { describe, expect, it } from 'vitest';
import { parseVenuePackage, sampleVenue } from './index';

describe('venue package validation', () => {
  it('roundtrips a serialized original fixture', () => {
    expect(parseVenuePackage(JSON.parse(JSON.stringify(sampleVenue)))).toEqual(
      sampleVenue,
    );
  });
  it('rejects unknown versions, duplicate IDs and dangling references', () => {
    for (const change of [
      { schemaVersion: 2 },
      { nodes: [...sampleVenue.nodes, sampleVenue.nodes[0]] },
      { edges: [{ ...sampleVenue.edges[0], to: 'missing' }] },
      { pois: [{ ...sampleVenue.pois[0], nodeId: 'missing' }] },
      { anchors: [{ ...sampleVenue.anchors[0], venueId: 'another-venue' }] },
    ])
      expect(() => parseVenuePackage({ ...sampleVenue, ...change })).toThrow();
  });
  it('rejects impossible edge lengths and invalid floor references', () => {
    expect(() =>
      parseVenuePackage({
        ...sampleVenue,
        edges: [{ ...sampleVenue.edges[0], distanceMetres: 1 }],
      }),
    ).toThrow();
    expect(() =>
      parseVenuePackage({
        ...sampleVenue,
        nodes: [{ ...sampleVenue.nodes[0], floorId: 'missing' }],
      }),
    ).toThrow();
  });
  it('requires a declared connector for cross-floor edges', () => {
    const venue = structuredClone(sampleVenue);
    venue.floors.push({ ...venue.floors[0]!, id: 'upper', level: 1 });
    venue.nodes.push({ id: 'up', floorId: 'upper', x: 15, y: 10 });
    venue.edges.push({
      id: 'stairs',
      from: 'junction',
      to: 'up',
      distanceMetres: 5,
      bidirectional: true,
      stepFree: false,
    });
    expect(() => parseVenuePackage(venue)).toThrow(/connector/);
    venue.connectors.push({
      id: 'stair-link',
      kind: 'stairs',
      nodeIds: ['junction', 'up'],
    });
    venue.edges.at(-1)!.connectorId = 'stair-link';
    expect(parseVenuePackage(venue).floors).toHaveLength(2);
    venue.edges.at(-1)!.stepFree = true;
    expect(() => parseVenuePackage(venue)).toThrow(/step-free/);
  });
});

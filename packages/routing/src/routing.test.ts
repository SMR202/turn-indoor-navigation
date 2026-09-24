import { describe, expect, it } from 'vitest';
import { routeSchema } from '@turn/contracts';
import { parseVenuePackage, sampleVenue } from '@turn/venue-model';
import { calculateRoute } from './index';

describe('local routing', () => {
  it('reports floor transition and arrival while honoring stair access', () => {
    const input = structuredClone(sampleVenue);
    input.floors.push({
      ...input.floors[0]!,
      id: 'upper',
      label: 'Upper floor',
      level: 1,
    });
    input.nodes.push({ id: 'up', floorId: 'upper', x: 15, y: 10 });
    input.connectors.push({
      id: 'stairs',
      kind: 'stairs',
      nodeIds: ['junction', 'up'],
    });
    input.edges.push({
      id: 'up-edge',
      from: 'junction',
      to: 'up',
      distanceMetres: 5,
      bidirectional: true,
      stepFree: false,
      connectorId: 'stairs',
    });
    const venue = parseVenuePackage(input);
    const result = calculateRoute(venue, 'entrance', 'up');
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected route');
    expect(result.route.distanceMetres).toBe(17);
    expect(
      result.route.instructions.slice(-2).map((step) => step.kind),
    ).toEqual(['floor-transition', 'arrive']);
    expect(
      calculateRoute(venue, 'entrance', 'up', { stepFree: true }).status,
    ).toBe('unreachable');
  });
  it('finds the expected metric route and conforms to the shared contract', () => {
    const result = calculateRoute(sampleVenue, 'entrance', 'library');
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('Expected route');
    expect(result.route.nodeIds).toEqual(['entrance', 'junction', 'library']);
    expect(result.route.distanceMetres).toBe(19);
    expect(routeSchema.parse(result.route)).toEqual(result.route);
  });
  it('distinguishes missing endpoints from disconnected valid nodes', () => {
    expect(calculateRoute(sampleVenue, 'missing', 'cafe').status).toBe(
      'invalid-endpoint',
    );
    expect(
      calculateRoute({ ...sampleVenue, edges: [] }, 'entrance', 'cafe').status,
    ).toBe('unreachable');
  });
  it('handles same-location arrival and repeatable results', () => {
    const result = calculateRoute(sampleVenue, 'entrance', 'entrance');
    expect(result.status === 'ok' && result.route.distanceMetres).toBe(0);
    expect(result.status === 'ok' && result.route.instructions[0]?.kind).toBe(
      'arrive',
    );
    expect(
      JSON.stringify(calculateRoute(sampleVenue, 'entrance', 'cafe')),
    ).toBe(JSON.stringify(calculateRoute(sampleVenue, 'entrance', 'cafe')));
  });
  it('honors directed edges and step-free filtering', () => {
    const directed = {
      ...sampleVenue,
      edges: sampleVenue.edges.map((edge) => ({
        ...edge,
        bidirectional: false,
      })),
    };
    expect(calculateRoute(directed, 'library', 'entrance').status).toBe(
      'unreachable',
    );
    const restricted = {
      ...sampleVenue,
      edges: sampleVenue.edges.map((edge) => ({ ...edge, stepFree: false })),
    };
    expect(
      calculateRoute(restricted, 'entrance', 'library', { stepFree: true })
        .status,
    ).toBe('unreachable');
    expect(calculateRoute(restricted, 'entrance', 'library').status).toBe('ok');
  });
  it('chooses lower total cost even when a longer direct edge appears first', () => {
    const venue = parseVenuePackage({
      ...sampleVenue,
      edges: [
        {
          id: 'long',
          from: 'entrance',
          to: 'cafe',
          distanceMetres: 30,
          bidirectional: true,
          stepFree: true,
        },
        ...sampleVenue.edges,
      ],
    });
    const result = calculateRoute(venue, 'entrance', 'cafe');
    expect(result.status === 'ok' && result.route.distanceMetres).toBe(24);
  });
});

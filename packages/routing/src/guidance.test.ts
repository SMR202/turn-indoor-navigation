import { expect, it } from 'vitest';
import type { Pose, Route } from '@turn/contracts';
import { RouteGuidance, initialRouteHeading } from './guidance';
const route: Route = {
  schemaVersion: 1,
  venueId: 'test',
  venueRevision: '1',
  sourceNodeId: 'a',
  destinationNodeId: 'c',
  stepFree: false,
  distanceMetres: 10,
  nodeIds: ['a', 'b', 'c'],
  geometry: [
    { x: 0, y: 0, floorId: 'ground' },
    { x: 5, y: 0, floorId: 'ground' },
    { x: 5, y: 5, floorId: 'ground' },
  ],
  instructions: [],
};
function pose(x: number, y: number, time: number): Pose {
  return {
    schemaVersion: 1,
    sessionId: 'walk',
    source: 'test',
    timestampSeconds: time,
    venueId: 'test',
    venueRevision: '1',
    floorId: 'ground',
    position: { x, y },
    headingRad: 0,
    horizontalUncertaintyMetres: null,
    status: 'degraded',
  };
}
it('announces turns, measures remaining distance and requires explicit arrival confirmation', () => {
  const guide = new RouteGuidance(route);
  expect(initialRouteHeading(route)).toBe(0);
  expect(guide.consume(pose(0, 0, 0))).toMatchObject({
    action: 'left',
    distanceToActionMetres: 5,
    remainingMetres: 10,
  });
  expect(guide.consume(pose(4.5, 0, 1))).toMatchObject({
    action: 'left',
    distanceToActionMetres: 0.5,
  });
  expect(guide.consume(pose(5, 0.6, 2))).toMatchObject({
    action: 'arrive',
    remainingMetres: 4.4,
  });
  expect(guide.consume(pose(5, 4.5, 3))).toMatchObject({
    status: 'near-destination',
  });
});
it('never jumps directly onto a later segment and latches recovery until a new anchor route', () => {
  const guide = new RouteGuidance(route);
  const original = pose(5, 4.8, 1);
  guide.consume(pose(0, 0, 0));
  expect(guide.consume(original).status).not.toBe('near-destination');
  expect(guide.consume(pose(5, 4.8, 2.1)).status).toBe('recover');
  expect(guide.consume(pose(0, 0, 3)).status).toBe('recover');
  expect(original.position).toEqual({ x: 5, y: 4.8 });
  expect(new RouteGuidance(route).consume(pose(0, 0, 4)).status).toBe(
    'following',
  );
});
it('rejects lost, mismatched and multi-floor positioning and suppresses transient off-route arrival', () => {
  expect(
    new RouteGuidance(route).consume({ ...pose(0, 0, 0), status: 'lost' })
      .status,
  ).toBe('recover');
  expect(
    new RouteGuidance(route).consume({
      ...pose(0, 0, 0),
      venueRevision: 'other',
    }).status,
  ).toBe('recover');
  const multi = {
    ...route,
    geometry: route.geometry.map((p, i) => ({
      ...p,
      floorId: i === 2 ? 'upper' : 'ground',
    })),
  };
  expect(new RouteGuidance(multi).snapshot().status).toBe('unsupported');
});
it('handles same-node routes, duplicate vertices and right turns', () => {
  expect(
    new RouteGuidance({ ...route, geometry: [route.geometry[0]!] }).consume(
      pose(0, 0, 0),
    ).status,
  ).toBe('near-destination');
  const right = {
    ...route,
    geometry: [
      route.geometry[0]!,
      route.geometry[0]!,
      route.geometry[1]!,
      { x: 5, y: -5, floorId: 'ground' },
    ],
  };
  expect(new RouteGuidance(right).consume(pose(0, 0, 0))).toMatchObject({
    action: 'right',
    remainingMetres: 10,
  });
});

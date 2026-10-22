import { expect, it } from 'vitest';
import { demoCentre, sampleVenue } from '@turn/venue-model';
import {
  buildFusionMap,
  etaMinutes,
  headingAlongRoute,
  nearestAnchor,
  nearestRoutableNode,
  remainingRoute,
  roomBelief,
  roomCentre,
  roomNameAt,
} from './assist-helpers';

const floorId = sampleVenue.floors[0]!.id;
it('builds a fusion map from the venue floor', () => {
  const map = buildFusionMap(sampleVenue, floorId);
  expect(map.floorId).toBe(floorId);
  expect(map.walls.length).toBe(sampleVenue.floors[0]!.walls.length);
  expect(map.walkable.length).toBeGreaterThan(0);
});
it('snaps to the nearest node and anchor on the same floor', () => {
  const a = sampleVenue.anchors[0]!;
  expect(nearestAnchor(sampleVenue, floorId, a.position).id).toBe(a.id);
  const node = nearestRoutableNode(sampleVenue, floorId, a.position);
  expect(node.floorId).toBe(floorId);
  expect(Math.hypot(node.x - a.position.x, node.y - a.position.y)).toBeLessThan(
    5,
  );
});
it('returns only the remaining part of a route and a heading along it', () => {
  const route = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ];
  expect(remainingRoute(route, { x: 4, y: 1 })).toEqual([
    { x: 4, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
  ]);
  expect(remainingRoute(route, { x: 10.5, y: 6 })[0]).toEqual({ x: 10, y: 6 });
  expect(remainingRoute(route, { x: 99, y: 99 }).at(-1)).toEqual({
    x: 10,
    y: 10,
  });
  expect(headingAlongRoute(route, { x: 0, y: 0 })).toBeCloseTo(0);
  expect(
    headingAlongRoute(
      remainingRoute(route, { x: 10, y: 0 }),
      { x: 10, y: 0 },
      2,
    ),
  ).toBeCloseTo(Math.PI / 2);
  expect(headingAlongRoute([{ x: 0, y: 0 }], { x: 0, y: 0 })).toBeNull();
});
it('reports a room name only inside a room and a sensible ETA', () => {
  const room = sampleVenue.floors[0]!.rooms[0];
  if (room)
    expect(roomNameAt(sampleVenue, floorId, room.labelPosition)).toBeTruthy();
  expect(roomNameAt(sampleVenue, floorId, { x: -50, y: -50 })).toBeNull();
  expect(etaMinutes(10)).toBe(1);
  expect(etaMinutes(200)).toBe(3);
});

it('summarises the filter hypotheses as rooms, likeliest first', () => {
  const floor = demoCentre.floors[0]!;
  const rooms = floor.rooms.filter((r) => r.kind !== 'fixture' && r.name);
  const [a, b] = [rooms[0]!, rooms[1]!];
  const ca = roomCentre(a.polygon).centre;
  const cb = roomCentre(b.polygon).centre;
  // 70 % of the weight in room a, 30 % in room b.
  const points = [
    ...Array.from({ length: 7 }, () => ({ ...ca, w: 0.1 })),
    ...Array.from({ length: 3 }, () => ({ ...cb, w: 0.1 })),
  ];
  const belief = roomBelief(demoCentre, floor.id, points);
  expect(belief.map((r) => r.roomId)).toEqual([a.id, b.id]);
  expect(belief[0]!.probability).toBeCloseTo(0.7, 5);
  expect(roomNameAt(demoCentre, floor.id, belief[0]!.centre)).toBe(a.name);
  expect(belief[0]!.radius).toBeGreaterThan(0.5);
  expect(roomBelief(demoCentre, 'no-such-floor', points)).toEqual([]);
});

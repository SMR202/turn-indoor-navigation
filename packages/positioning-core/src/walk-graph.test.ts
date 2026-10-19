import { expect, it } from 'vitest';
import {
  buildWalkGraph,
  crossesWalls,
  pathLength,
  segmentsIntersect,
  walkingPath,
} from './walk-graph';

// Two 10 x 10 m rooms; the wall at x = 10 has a door between y = 4 and y = 6.
const walls = [
  { from: { x: 0, y: 0 }, to: { x: 20, y: 0 } },
  { from: { x: 20, y: 0 }, to: { x: 20, y: 10 } },
  { from: { x: 20, y: 10 }, to: { x: 0, y: 10 } },
  { from: { x: 0, y: 10 }, to: { x: 0, y: 0 } },
  { from: { x: 10, y: 0 }, to: { x: 10, y: 4 } },
  { from: { x: 10, y: 6 }, to: { x: 10, y: 10 } },
];
const nodes = [
  { id: 'a', x: 5, y: 5 },
  { id: 'door', x: 10, y: 5 },
  { id: 'b', x: 15, y: 5 },
];
const graph = buildWalkGraph(nodes, [
  { from: 'a', to: 'door' },
  { from: 'door', to: 'b' },
]);

it('treats touching end points as not crossing', () => {
  expect(
    segmentsIntersect(
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 0 },
    ),
  ).toBe(false);
  expect(
    segmentsIntersect(
      { x: 0, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
      { x: 2, y: 0 },
    ),
  ).toBe(true);
});

it('walks straight when nothing is in the way', () => {
  const a = { x: 2, y: 2 },
    b = { x: 8, y: 8 };
  expect(walkingPath(graph, walls, a, b)).toEqual([a, b]);
});

it('goes round through the door instead of through the wall', () => {
  const a = { x: 6, y: 8 },
    b = { x: 14, y: 8 };
  const path = walkingPath(graph, walls, a, b)!;
  expect(path).not.toBeNull();
  expect(path[0]).toEqual(a);
  expect(path.at(-1)).toEqual(b);
  for (let i = 1; i < path.length; i++)
    expect(crossesWalls(path[i - 1]!, path[i]!, walls)).toBe(false);
  expect(path).toContainEqual({ x: 10, y: 5 });
  expect(pathLength(path)).toBeGreaterThan(8);
});

it('reports no path when the rooms are not connected', () => {
  // Door closed: nothing in the first room's graph is visible from the second room.
  const closed = [...walls, { from: { x: 10, y: 4 }, to: { x: 10, y: 6 } }];
  const oneRoom = buildWalkGraph([nodes[0]!], []);
  expect(
    walkingPath(oneRoom, closed, { x: 6, y: 8 }, { x: 14, y: 8 }),
  ).toBeNull();
});

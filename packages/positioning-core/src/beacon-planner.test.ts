import { expect, it } from 'vitest';
import {
  layoutRoundness,
  planBeacons,
  type PlannerInput,
} from './beacon-planner';

// Three rooms in a row (10 x 6 m each) separated by walls with door gaps.
const rooms = [0, 10, 20].map((x, i) => ({
  name: `R${i + 1}`,
  polygon: [
    { x, y: 0 },
    { x: x + 10, y: 0 },
    { x: x + 10, y: 6 },
    { x, y: 6 },
  ],
}));
const walls = [10, 20].flatMap((x) => [
  { from: { x, y: 0 }, to: { x, y: 2 } },
  { from: { x, y: 4 }, to: { x, y: 6 } },
]);
const candidates = [2, 5, 8, 12, 15, 18, 22, 25, 28].flatMap((x) =>
  [1.5, 4.5].map((y) => ({ x, y, id: `n${x}-${y}` })),
);
const input: PlannerInput = { rooms, walls, candidates, doors: [] };

it('places beacons at least 3 m apart and reports predicted coverage', () => {
  const plan = planBeacons(input, { count: 4 });
  expect(plan.sites).toHaveLength(4);
  for (let i = 0; i < 4; i++)
    for (let j = i + 1; j < 4; j++)
      expect(
        Math.hypot(
          plan.sites[i]!.x - plan.sites[j]!.x,
          plan.sites[i]!.y - plan.sites[j]!.y,
        ),
      ).toBeGreaterThanOrEqual(3);
  expect(plan.quality.coverage3).toBeGreaterThan(0.5);
  expect(plan.quality.minHeard).toBeGreaterThanOrEqual(0);
  expect(plan.sites.map((s) => s.tag)).toEqual(['B1', 'B2', 'B3', 'B4']);
});
it('more beacons never reduce predicted coverage and walls reduce it', () => {
  const few = planBeacons(input, { count: 3 }).quality;
  const many = planBeacons(input, { count: 6 }).quality;
  expect(many.coverage3).toBeGreaterThanOrEqual(few.coverage3);
  const open = planBeacons({ ...input, walls: [] }, { count: 3 }).quality;
  expect(open.coverage3).toBeGreaterThanOrEqual(few.coverage3);
});
it('measures how round a layout is and handles degenerate input', () => {
  expect(
    layoutRoundness([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
    ]),
  ).toBeCloseTo(0, 5);
  expect(
    layoutRoundness([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]),
  ).toBeGreaterThan(0.9);
  expect(planBeacons({ ...input, candidates: [] }, { count: 3 }).sites).toEqual(
    [],
  );
  expect(planBeacons(input, { count: 0 }).sites).toEqual([]);
});

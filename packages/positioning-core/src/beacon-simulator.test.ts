import { describe, expect, it } from 'vitest';
import { planForTarget, simulateAccuracy } from './beacon-simulator';

// A 30 × 12 m floor: a corridor along the middle, three rooms each side.
const room = (name: string, x: number, y: number) => ({
  name,
  kind: 'room' as const,
  polygon: [
    { x, y },
    { x: x + 10, y },
    { x: x + 10, y: y + 5 },
    { x, y: y + 5 },
  ],
});
const rooms = [
  room('A', 0, 0),
  room('B', 10, 0),
  room('C', 20, 0),
  room('D', 0, 7),
  room('E', 10, 7),
  room('F', 20, 7),
  {
    name: 'Corridor',
    kind: 'circulation' as const,
    polygon: [
      { x: 0, y: 5 },
      { x: 30, y: 5 },
      { x: 30, y: 7 },
      { x: 0, y: 7 },
    ],
  },
];
// Room walls with a 1 m door gap in each.
const walls = [0, 10, 20].flatMap((x) => [
  { from: { x, y: 5 }, to: { x: x + 4.5, y: 5 } },
  { from: { x: x + 5.5, y: 5 }, to: { x: x + 10, y: 5 } },
  { from: { x, y: 7 }, to: { x: x + 4.5, y: 7 } },
  { from: { x: x + 5.5, y: 7 }, to: { x: x + 10, y: 7 } },
  { from: { x, y: 0 }, to: { x, y: 5 } },
  { from: { x, y: 7 }, to: { x, y: 12 } },
]);
const input = {
  rooms,
  walls,
  candidates: rooms.flatMap((r) =>
    r.polygon.map((p, i, all) => {
      const next = all[(i + 1) % all.length]!;
      return { x: (p.x + next.x) / 2 + 0.01, y: (p.y + next.y) / 2 + 0.01 };
    }),
  ),
};
const centres = rooms
  .filter((r) => r.kind === 'room')
  .map((r) => ({ x: r.polygon[0]!.x + 5, y: r.polygon[0]!.y + 2.5 }));

describe('beacon simulator', () => {
  it('is deterministic for a seed and reports per-point errors', () => {
    const a = simulateAccuracy(input, centres, { trials: 3 });
    const b = simulateAccuracy(input, centres, { trials: 3 });
    expect(a.medianErrorMetres).toBe(b.medianErrorMetres);
    expect(a.points.length).toBeGreaterThan(50);
    expect(a.coverage).toBe(1);
  });
  it('predicts better accuracy with a beacon in every room than with two', () => {
    const six = simulateAccuracy(input, centres, { trials: 4 });
    const two = simulateAccuracy(input, [centres[0]!, centres[5]!], {
      trials: 4,
    });
    expect(six.medianErrorMetres).toBeLessThan(two.medianErrorMetres);
    expect(six.roomAccuracy).toBeGreaterThan(two.roomAccuracy);
    expect(six.roomAccuracy).toBeGreaterThan(0.7);
  });
  it('reports nothing heard far from every beacon', () => {
    const far = simulateAccuracy(input, [{ x: 500, y: 500 }], { trials: 2 });
    expect(far.coverage).toBe(0);
  });
  it('plans the fewest beacons for a room-level target and returns the cost curve', () => {
    const plan = planForTarget(input, 'room', {
      simulation: { trials: 3, gridMetres: 2 },
      maxBeacons: 10,
    });
    expect(plan.curve.length).toBeGreaterThan(0);
    // Met: the last count tried is the answer; not met: the best layout tried.
    if (plan.met) expect(plan.sites.length).toBe(plan.curve.at(-1)!.beacons);
    else expect(plan.sites.length).toBeGreaterThan(0);
    // More beacons never make the predicted median much worse along the curve.
    const first = plan.curve[0]!.medianErrorMetres;
    expect(plan.curve.at(-1)!.medianErrorMetres).toBeLessThanOrEqual(
      first + 0.5,
    );
  });
});

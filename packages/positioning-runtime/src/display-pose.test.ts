import { expect, it } from 'vitest';
import { crossesWalls } from '@turn/positioning-core';
import { DisplayPose } from './display-pose';

const route = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
];
function settle(d: DisplayPose, seconds = 3) {
  for (let i = 0; i < seconds * 20; i++) d.step(0.05);
  return d.current()!;
}

it('snaps to the route when close and follows the estimate smoothly', () => {
  const d = new DisplayPose();
  d.setRoute(route);
  d.update({ x: 1, y: 0.8 }, 0, true);
  expect(d.current()).toEqual({ x: 1, y: 0 });
  d.update({ x: 4, y: 1.2 }, 1, true);
  const first = d.step(0.05)!;
  expect(first.x).toBeGreaterThan(1);
  expect(first.x).toBeLessThan(4);
  expect(Math.hypot(first.x - 1, first.y)).toBeLessThanOrEqual(
    2.5 * 0.05 + 1e-9,
  );
  expect(settle(d).x).toBeCloseTo(4, 1);
  expect(d.current()!.y).toBeCloseTo(0, 5);
});
it('does not snap when the estimate is far from the route', () => {
  const d = new DisplayPose();
  d.setRoute(route);
  d.update({ x: 5, y: 4 }, 0, true);
  expect(d.current()).toEqual({ x: 5, y: 4 });
});
it('holds still while the user is standing, whatever the estimate does', () => {
  const d = new DisplayPose();
  d.update({ x: 3, y: 3 }, 0, true);
  settle(d, 1);
  for (let t = 5; t < 40; t += 1)
    d.update({ x: 3 + 0.3 * Math.sin(t), y: 3 - 0.3 * Math.cos(t) }, t, false);
  const end = settle(d);
  expect(Math.hypot(end.x - 3, end.y - 3)).toBeLessThan(0.05);
});
it('lets a user or fingerprint fix teleport the dot immediately', () => {
  const d = new DisplayPose();
  d.update({ x: 1, y: 1 }, 0, true);
  d.update({ x: 15, y: 20 }, 10, false, true);
  expect(d.current()).toEqual({ x: 15, y: 20 });
});
it('never outruns walking speed while animating after a large estimate jump', () => {
  const d = new DisplayPose();
  d.update({ x: 0, y: 0 }, 0, true);
  d.update({ x: 8, y: 0 }, 1, true);
  let prev = d.current()!;
  for (let i = 0; i < 40; i++) {
    const p = d.step(0.05)!;
    expect(Math.hypot(p.x - prev.x, p.y - prev.y)).toBeLessThanOrEqual(
      2.5 * 0.05 + 1e-9,
    );
    prev = p;
  }
});

// Two rooms; the wall at x = 10 has a door between y = 4 and y = 6.
const walls = [
  { from: { x: 0, y: 0 }, to: { x: 20, y: 0 } },
  { from: { x: 20, y: 0 }, to: { x: 20, y: 10 } },
  { from: { x: 20, y: 10 }, to: { x: 0, y: 10 } },
  { from: { x: 0, y: 10 }, to: { x: 0, y: 0 } },
  { from: { x: 10, y: 0 }, to: { x: 10, y: 4 } },
  { from: { x: 10, y: 6 }, to: { x: 10, y: 10 } },
];
const graph = {
  nodes: [
    { id: 'a', x: 5, y: 5 },
    { id: 'door', x: 10, y: 5 },
    { id: 'b', x: 15, y: 5 },
  ],
  edges: [
    { from: 'a', to: 'door' },
    { from: 'door', to: 'b' },
  ],
};
function trace(d: DisplayPose, seconds = 8) {
  const out = [d.current()!];
  for (let i = 0; i < seconds * 20; i++) out.push({ ...d.step(0.05)! });
  return out;
}

it('animates a move to the next room through the door, never through the wall', () => {
  const d = new DisplayPose();
  d.setMap({ walls, graph });
  d.update({ x: 7, y: 8 }, 0, true);
  d.update({ x: 13, y: 8 }, 0.5, true);
  const drawn = trace(d);
  for (let i = 1; i < drawn.length; i++)
    expect(crossesWalls(drawn[i - 1]!, drawn[i]!, walls)).toBe(false);
  expect(drawn.some((p) => Math.hypot(p.x - 10, p.y - 5) < 0.2)).toBe(true);
  expect(Math.hypot(drawn.at(-1)!.x - 13, drawn.at(-1)!.y - 8)).toBeLessThan(
    0.05,
  );
});
it('follows the route round corners instead of cutting them', () => {
  const d = new DisplayPose();
  d.setRoute(route);
  d.update({ x: 8, y: 0.5 }, 0, true);
  d.update({ x: 10.4, y: 3 }, 0.5, true);
  for (const p of trace(d, 3)) {
    const onFirst = Math.abs(p.y) < 1e-9 && p.x <= 10 + 1e-9;
    const onSecond = Math.abs(p.x - 10) < 1e-9;
    expect(onFirst || onSecond).toBe(true);
  }
  expect(d.current()!.x).toBe(10);
  expect(d.current()!.y).toBeCloseTo(3, 2);
});
it('ignores small backward wobbles along the route', () => {
  const d = new DisplayPose();
  d.setRoute(route);
  d.update({ x: 5, y: 0.3 }, 0, true);
  d.update({ x: 4.4, y: -0.3 }, 0.5, true);
  expect(trace(d, 1).at(-1)).toEqual({ x: 5, y: 0 });
  d.update({ x: 2, y: 0.2 }, 1, true); // a real turn back is shown
  expect(trace(d, 3).at(-1)!.x).toBeCloseTo(2, 2);
});
it('does not snap to a route on the other side of a wall', () => {
  const d = new DisplayPose();
  d.setMap({ walls, graph });
  d.setRoute([
    { x: 11, y: 1 },
    { x: 11, y: 9 },
  ]);
  d.update({ x: 9.5, y: 8 }, 0, true);
  expect(d.current()).toEqual({ x: 9.5, y: 8 });
});
it('jumps instead of drawing a walk when no walkable connection exists', () => {
  const closed = [...walls, { from: { x: 10, y: 4 }, to: { x: 10, y: 6 } }];
  const d = new DisplayPose();
  d.setMap({ walls: closed, graph: { nodes: [graph.nodes[0]!], edges: [] } });
  d.update({ x: 7, y: 8 }, 0, true);
  d.update({ x: 13, y: 8 }, 0.5, true);
  expect(d.current()).toEqual({ x: 13, y: 8 });
});

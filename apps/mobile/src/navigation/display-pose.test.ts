import { expect, it } from 'vitest';
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

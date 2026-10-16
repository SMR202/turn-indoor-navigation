import { describe, expect, it } from 'vitest';
import {
  ParticleFusion,
  exponentFromReading,
  predictRssi,
  type FusionBeacon,
  type FusionMap,
} from './fusion';

// Two 10 x 10 m rooms joined by a 2 m door gap in the wall at x = 10.
const map: FusionMap = {
  floorId: 'f',
  walkable: [
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
    [
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 10, y: 10 },
    ],
  ],
  walls: [
    { from: { x: 0, y: 0 }, to: { x: 20, y: 0 } },
    { from: { x: 20, y: 0 }, to: { x: 20, y: 10 } },
    { from: { x: 20, y: 10 }, to: { x: 0, y: 10 } },
    { from: { x: 0, y: 10 }, to: { x: 0, y: 0 } },
    { from: { x: 10, y: 0 }, to: { x: 10, y: 4 } },
    { from: { x: 10, y: 6 }, to: { x: 10, y: 10 } },
  ],
};
const beacons: FusionBeacon[] = [
  { tag: 'B1', x: 3, y: 8, refRssi: -59, exponent: 2.2 },
  { tag: 'B2', x: 10, y: 1, refRssi: -59, exponent: 2.2 },
  { tag: 'B3', x: 17, y: 3, refRssi: -59, exponent: 2.2 },
];
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
function gauss(r: () => number) {
  return (
    Math.sqrt(-2 * Math.log(Math.max(1e-12, r()))) * Math.cos(2 * Math.PI * r())
  );
}
const waypoints = [
  { x: 2, y: 2 },
  { x: 8, y: 5 },
  { x: 12, y: 5 },
  { x: 18, y: 8 },
];
function walk(
  seed: number,
  opts: { bias: number; scale: number; useRssi: boolean },
) {
  const r = lcg(seed);
  const fusion = new ParticleFusion(map, beacons, { seed, particles: 400 });
  fusion.reset(waypoints[0]!.x, waypoints[0]!.y, 0.8);
  let truth = { ...waypoints[0]! };
  let pdr = { ...waypoints[0]! };
  const errRaw: number[] = [];
  const errFused: number[] = [];
  let steps = 0;
  for (let w = 1; w < waypoints.length; w++) {
    const target = waypoints[w]!;
    const total = Math.hypot(target.x - truth.x, target.y - truth.y);
    const n = Math.ceil(total / 0.7);
    const dx = (target.x - truth.x) / n,
      dy = (target.y - truth.y) / n;
    for (let k = 0; k < n; k++) {
      truth = { x: truth.x + dx, y: truth.y + dy };
      const heading = Math.atan2(dy, dx) + opts.bias + gauss(r) * 0.08;
      const len = Math.hypot(dx, dy) * opts.scale * (1 + gauss(r) * 0.05);
      const mx = len * Math.cos(heading),
        my = len * Math.sin(heading);
      pdr = { x: pdr.x + mx, y: pdr.y + my };
      fusion.predict(mx, my);
      steps++;
      if (opts.useRssi && steps % 2 === 0) {
        const readings = beacons.map((b) => {
          const d = Math.hypot(truth.x - b.x, truth.y - b.y);
          const shadow = gauss(r) * 4 + (r() < 0.1 ? -12 : 0);
          return { tag: b.tag, rssi: predictRssi(b, d) + shadow };
        });
        fusion.updateRssi(readings);
      }
      const est = fusion.estimate();
      errRaw.push(Math.hypot(pdr.x - truth.x, pdr.y - truth.y));
      errFused.push(Math.hypot(est.x - truth.x, est.y - truth.y));
    }
  }
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  return {
    raw: mean(errRaw),
    fused: mean(errFused),
    rawEnd: errRaw.at(-1)!,
    fusedEnd: errFused.at(-1)!,
    sigma: fusion.estimate().sigmaMetres,
  };
}

describe('particle fusion (synthetic mechanics, not venue accuracy)', () => {
  it('cancels simulated heading and scale drift using beacon ranges and the floor plan', () => {
    const runs = [11, 22, 33, 44, 55].map((seed) =>
      walk(seed, { bias: 0.2, scale: 1.1, useRssi: true }),
    );
    const mean = (f: (r: (typeof runs)[number]) => number) =>
      runs.reduce((s, r) => s + f(r), 0) / runs.length;
    expect(mean((r) => r.raw)).toBeGreaterThan(1.5); // the drift is real
    expect(mean((r) => r.fused)).toBeLessThan(2.2);
    expect(mean((r) => r.fused)).toBeLessThan(mean((r) => r.raw) * 0.75);
    expect(mean((r) => r.fusedEnd)).toBeLessThan(mean((r) => r.rawEnd));
  });
  it('is deterministic for a seed and never crosses a wall', () => {
    const a = walk(7, { bias: 0.15, scale: 1.05, useRssi: true });
    const b = walk(7, { bias: 0.15, scale: 1.05, useRssi: true });
    expect(a).toEqual(b);
    const f = new ParticleFusion(map, beacons, { seed: 3 });
    f.reset(9, 5, 0.3);
    f.predict(3, 0); // through the door gap at y = 5 is allowed
    expect(f.estimate().x).toBeGreaterThan(10);
    const g = new ParticleFusion(map, beacons, { seed: 3 });
    g.reset(9, 2, 0.2);
    for (let i = 0; i < 6; i++) g.predict(1, 0); // straight into the solid wall
    expect(g.estimate().x).toBeLessThan(10.05);
  });
  it('localizes from beacon readings alone and reports its uncertainty', () => {
    const errors: number[] = [];
    for (const seed of [1, 2, 3, 4]) {
      const r = lcg(seed);
      const truth = { x: 4 + r() * 3, y: 4 + r() * 3 };
      const f = new ParticleFusion(map, beacons, { seed, particles: 800 });
      const readings = beacons.map((b) => ({
        tag: b.tag,
        rssi:
          predictRssi(b, Math.hypot(truth.x - b.x, truth.y - b.y)) +
          gauss(r) * 3,
      }));
      expect(f.initFromRssi(readings)).toBe(true);
      const e = f.estimate();
      errors.push(Math.hypot(e.x - truth.x, e.y - truth.y));
      expect(e.sigmaMetres).toBeGreaterThan(0);
    }
    expect(errors.reduce((s, v) => s + v, 0) / errors.length).toBeLessThan(4.5);
    expect(
      new ParticleFusion(map, beacons).initFromRssi([{ tag: 'X', rssi: -50 }]),
    ).toBe(false);
  });
  it('restarts around a position fix that contradicts the whole cloud', () => {
    const f = new ParticleFusion(map, beacons, { seed: 5 });
    f.reset(2, 2, 0.5);
    f.updatePosition(17, 8, 1);
    const e = f.estimate();
    expect(Math.hypot(e.x - 17, e.y - 8)).toBeLessThan(1.5);
  });
  it('derives path-loss exponents defensively', () => {
    expect(exponentFromReading(-59, -59 - 22 * Math.log10(4), 4)).toBeCloseTo(
      2.2,
      1,
    );
    expect(exponentFromReading(-59, -70, 1)).toBeUndefined();
    expect(exponentFromReading(-59, -200, 5)).toBe(3.8);
  });
});

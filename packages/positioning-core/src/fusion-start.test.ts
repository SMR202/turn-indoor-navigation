import { describe, expect, it } from 'vitest';
import {
  ParticleFusion,
  predictRssi,
  type FusionBeacon,
  type FusionMap,
} from './fusion';

/**
 * Starting a walk facing the wrong way (Plan 005 §7.2). Simulated: these show the filter can
 * recover, not how often it will in a building.
 *
 * A 30 x 3 m corridor (y 0..3) with a 6 x 6 m room off its west end. The walker starts in the
 * corridor at x = 10.
 */
const map: FusionMap = {
  floorId: 'f',
  walkable: [
    [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 3 },
      { x: 0, y: 3 },
    ],
    [
      { x: 0, y: 3 },
      { x: 6, y: 3 },
      { x: 6, y: 9 },
      { x: 0, y: 9 },
    ],
  ],
  walls: [
    { from: { x: 0, y: 0 }, to: { x: 30, y: 0 } },
    { from: { x: 30, y: 0 }, to: { x: 30, y: 3 } },
    { from: { x: 30, y: 3 }, to: { x: 6, y: 3 } },
    { from: { x: 6, y: 3 }, to: { x: 6, y: 9 } },
    { from: { x: 6, y: 9 }, to: { x: 0, y: 9 } },
    { from: { x: 0, y: 9 }, to: { x: 0, y: 0 } },
    // The room's wall onto the corridor, with a door at x 2..4.
    { from: { x: 0, y: 3 }, to: { x: 2, y: 3 } },
    { from: { x: 4, y: 3 }, to: { x: 6, y: 3 } },
  ],
};
const beacons: FusionBeacon[] = [
  { tag: 'WEST', x: 1, y: 1.5, refRssi: -59, exponent: 2.2 },
  { tag: 'EAST', x: 29, y: 1.5, refRssi: -59, exponent: 2.2 },
];
const start = { x: 10, y: 1.5 };

/**
 * The walker really walks `truth` (unit direction) while the phone's walking sensors, aligned to
 * the assumed start heading, report `sensed`.
 */
function walk(
  fusion: ParticleFusion,
  truth: { x: number; y: number },
  sensed: { x: number; y: number },
  metres: number,
  options: { radio?: boolean } = {},
) {
  let at = { ...start };
  for (let d = 0; d < metres; d += 0.7) {
    at = { x: at.x + truth.x * 0.7, y: at.y + truth.y * 0.7 };
    fusion.predict(sensed.x * 0.7, sensed.y * 0.7);
    if (options.radio && Math.round(d / 0.7) % 4 === 3)
      fusion.updateRssi(
        beacons.map((b) => ({
          tag: b.tag,
          rssi: predictRssi(b, Math.hypot(at.x - b.x, at.y - b.y)),
        })),
      );
  }
  return at;
}
const east = { x: 1, y: 0 };
const west = { x: -1, y: 0 };

describe('a walk that starts facing the wrong way', () => {
  it('reports the told direction first, without lagging behind', () => {
    const f = new ParticleFusion(map, beacons, { seed: 3, particles: 400 });
    f.reset(start.x, start.y, 0.8, 0.4, 0.25);
    // The walker did face east, as assumed.
    const truth = walk(f, east, east, 7);
    const e = f.estimate();
    expect(Math.abs(e.x - truth.x)).toBeLessThan(1.5);
    expect(e.flipped).toBe(false);
    // The other possibility is still held, quietly.
    expect(e.alternativeWeight).toBeGreaterThan(0.1);
    expect(e.alternativeWeight).toBeLessThan(0.4);
  });

  it('switches to the opposite hypothesis when beacons contradict the told direction', () => {
    const f = new ParticleFusion(map, beacons, {
      seed: 5,
      particles: 400,
      rssiSigmaDb: 6,
    });
    f.reset(start.x, start.y, 0.8, 0.4, 0.25);
    // Assumed east, really walking west: the sensors say "forward", the signals say otherwise.
    const truth = walk(f, west, east, 8, { radio: true });
    const e = f.estimate();
    expect(e.flipped).toBe(true);
    expect(Math.abs(e.x - truth.x)).toBeLessThan(2.5);
    // And the heading correction is about half a turn.
    expect(Math.abs(Math.cos(e.headingBiasRad) + 1)).toBeLessThan(0.3);
  });

  it('cannot recover without the second hypothesis (the old behaviour)', () => {
    const f = new ParticleFusion(map, beacons, {
      seed: 5,
      particles: 400,
      rssiSigmaDb: 6,
    });
    f.reset(start.x, start.y, 0.8, 0.4, 0);
    const truth = walk(f, west, east, 8, { radio: true });
    const e = f.estimate();
    expect(e.flipped).toBe(false);
    expect(Math.abs(e.x - truth.x)).toBeGreaterThan(4);
  });

  it('switches when the walls contradict the told direction, with no beacons at all', () => {
    const f = new ParticleFusion(map, [], { seed: 9, particles: 500 });
    // Start 1.5 m from the east end, told "facing east" but really walking west.
    f.reset(28.5, 1.5, 0.5, 0.3, 0.25);
    let truthX = 28.5;
    for (let d = 0; d < 10; d += 0.7) {
      truthX -= 0.7;
      f.predict(0.7, 0);
    }
    const e = f.estimate();
    // Going "east" runs into the end wall after 1.5 m; only the opposite family can keep walking.
    expect(e.flipped).toBe(true);
    expect(Math.abs(e.x - truthX)).toBeLessThan(2.5);
  });

  it('lets the route pull within each hypothesis, not choose between them', () => {
    const f = new ParticleFusion(map, [], { seed: 2, particles: 400 });
    f.reset(start.x, start.y, 0.8, 0.4, 0.25);
    const route = [start, { x: 28, y: 1.5 }];
    for (let d = 0; d < 6; d += 0.7) {
      f.predict(0.7, 0);
      f.weightByPath(route, 2.5, 0.15);
    }
    // The opposite family walked away from the route, yet it keeps its share.
    expect(f.estimate().alternativeWeight).toBeGreaterThan(0.15);
  });

  it('drops the unused hypothesis after 25 m of walking', () => {
    const f = new ParticleFusion(map, [], { seed: 4, particles: 300 });
    f.reset(2, 1.5, 0.5, 0.3, 0.25);
    for (let d = 0; d < 27; d += 0.7) f.predict(0.7, 0);
    const e = f.estimate();
    expect(e.alternativeWeight).toBe(0);
    expect(e.flipped).toBe(false);
  });

  it('keeps one hypothesis when the walker marked the direction or nothing is known', () => {
    const f = new ParticleFusion(map, beacons, { seed: 1, particles: 200 });
    f.reset(start.x, start.y, 0.8, 0.3, 0);
    expect(f.estimate().alternativeWeight).toBe(0);
    // A full-circle start already covers every direction.
    f.reset(start.x, start.y, 0.8, Math.PI, 0.25);
    expect(f.estimate().alternativeWeight).toBe(0);
  });
});

describe('a disturbed compass', () => {
  it('spreads the heading faster while the disturbance lasts', () => {
    const spread = (factor: number) => {
      const f = new ParticleFusion(map, [], { seed: 6, particles: 400 });
      f.reset(2, 1.5, 0.3, 0.05);
      f.setHeadingNoiseFactor(factor);
      for (let d = 0; d < 20; d += 0.7) f.predict(0.7, 0);
      return f.estimate().headingBiasSpread;
    };
    expect(spread(4)).toBeGreaterThan(spread(1) * 1.5);
  });
  it('widens a doubtful start heading on request', () => {
    const f = new ParticleFusion(map, [], { seed: 6, particles: 400 });
    f.reset(10, 1.5, 0.3, 0.1);
    const before = f.estimate().headingBiasSpread;
    f.spreadHeading(0.4);
    expect(f.estimate().headingBiasSpread).toBeGreaterThan(before + 0.2);
  });
});

describe('a position that is simply wrong', () => {
  const at = (x: number) =>
    beacons.map((b) => ({
      tag: b.tag,
      rssi: predictRssi(b, Math.hypot(x - b.x, 0)),
    }));
  it('is refused by the gate, then found again over the whole floor', () => {
    const f = new ParticleFusion(map, beacons, {
      seed: 8,
      particles: 500,
      rssiSigmaDb: 6,
      rssiGateSigmas: 2.5,
    });
    // Believed at the east end; really at the west end (carried there, or a bad start).
    f.reset(27, 1.5, 0.6, 0.1);
    expect(f.updateRssi(at(3))).toBe(false);
    expect(f.estimate().x).toBeGreaterThan(20);
    expect(f.recoverFromRssi(at(3))).toBe(true);
    expect(Math.abs(f.estimate().x - 3)).toBeLessThan(4);
  });
  it('leaves a correct cloud where it is', () => {
    const f = new ParticleFusion(map, beacons, {
      seed: 8,
      particles: 500,
      rssiSigmaDb: 6,
    });
    f.reset(12, 1.5, 0.8, 0.1);
    f.recoverFromRssi(at(12));
    expect(Math.abs(f.estimate().x - 12)).toBeLessThan(3);
  });
  it('needs at least two beacons to look again', () => {
    const f = new ParticleFusion(map, beacons, { seed: 8, particles: 200 });
    f.reset(27, 1.5, 0.6, 0.1);
    expect(f.recoverFromRssi([{ tag: 'WEST', rssi: -70 }])).toBe(false);
    expect(f.estimate().x).toBeGreaterThan(20);
  });
});

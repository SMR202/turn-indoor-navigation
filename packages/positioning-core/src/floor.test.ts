import { describe, expect, it } from 'vitest';
import {
  FloorBelief,
  FloorChangeDetector,
  pressureAltitude,
  shownFloor,
  type FloorChangeEvent,
} from './floor';

/** Pressure (hPa) at a height (m): the inverse of `pressureAltitude`. */
const pressureAt = (metres: number, seaLevel = 1013.25) =>
  seaLevel * Math.pow(1 - metres / 44330, 1 / 0.190263);

/** Deterministic noise in [-1, 1]. */
function noise(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

type Segment = {
  seconds: number;
  /** Vertical speed in m/s (positive up). */
  climb?: number;
  stepping?: boolean;
  /** An instant pressure step in hPa at the start of the segment (a door, ventilation). */
  stepHPa?: number;
};
/** Plays a walk through the detector and returns the events. Simulated: not a venue result. */
function play(
  segments: Segment[],
  options: { hz?: number; noiseHPa?: number; driftHPaPerHour?: number } = {},
) {
  const hz = options.hz ?? 1;
  const rnd = noise(7);
  const detector = new FloorChangeDetector();
  const events: FloorChangeEvent[] = [];
  let t = 0;
  let h = 540; // Islamabad-like ground level; only changes matter.
  let offset = 0;
  for (const seg of segments) {
    offset += seg.stepHPa ?? 0;
    for (let i = 0; i < seg.seconds * hz; i++) {
      t += 1 / hz;
      h += (seg.climb ?? 0) / hz;
      const p =
        pressureAt(h) +
        offset +
        ((options.driftHPaPerHour ?? 0) * t) / 3600 +
        rnd() * (options.noiseHPa ?? 0.02);
      const e = detector.update({
        t,
        pressureHPa: p,
        stepping: seg.stepping ?? false,
      });
      if (e) events.push(e);
    }
  }
  return events;
}

describe('pressure to height', () => {
  it('is about 8.4 m per hPa near sea level', () => {
    const d = pressureAltitude(1012.25) - pressureAltitude(1013.25);
    expect(d).toBeGreaterThan(8.2);
    expect(d).toBeLessThan(8.6);
  });
  it('round-trips with its inverse', () => {
    expect(pressureAltitude(pressureAt(123.4))).toBeCloseTo(123.4, 3);
  });
});

describe('floor-change detector (simulated walks)', () => {
  it('stays quiet through an hour of weather drift and sensor noise', () => {
    for (const drift of [1.2, -1.2])
      expect(
        play([{ seconds: 3600, stepping: true }], {
          driftHPaPerHour: drift,
          noiseHPa: 0.03,
        }),
      ).toEqual([]);
  });

  it('counts one storey up the stairs, with a pause on the landing', () => {
    const events = play([
      { seconds: 40, stepping: true },
      { seconds: 6, climb: 0.3, stepping: true }, // first flight, 1.8 m
      { seconds: 3, stepping: true }, // landing
      { seconds: 6, climb: 0.3, stepping: true }, // second flight
      { seconds: 30, stepping: true },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]!.floors).toBe(1);
    expect(events[0]!.via).toBe('stairs');
    expect(events[0]!.deltaMetres).toBeGreaterThan(3);
    expect(events[0]!.confidence).toBeGreaterThan(0.7);
  });

  it('counts three storeys down in a lift', () => {
    const events = play(
      [{ seconds: 30 }, { seconds: 9, climb: -1.2 }, { seconds: 20 }],
      { hz: 5 },
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.floors).toBe(-3);
    expect(events[0]!.via).toBe('lift');
  });

  it('ignores a pressure step from a door or ventilation', () => {
    for (const hz of [1, 10])
      expect(
        play(
          [
            { seconds: 30, stepping: true },
            { seconds: 40, stepping: true, stepHPa: 0.3 }, // looks like 2.5 m, instantly
            { seconds: 5, stepping: true, stepHPa: -0.3 },
            { seconds: 40, stepping: true },
          ],
          { hz },
        ),
      ).toEqual([]);
  });

  it('does not count half a storey (a mezzanine or a ramp), and recovers afterwards', () => {
    const events = play([
      { seconds: 30, stepping: true },
      { seconds: 6, climb: 0.25, stepping: true }, // 1.5 m and stops
      { seconds: 60, stepping: true },
      { seconds: 12, climb: 0.3, stepping: true }, // then a real storey
      { seconds: 30, stepping: true },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]!.floors).toBe(1);
  });

  it('counts two separate changes, up then down', () => {
    const events = play([
      { seconds: 20, stepping: true },
      { seconds: 12, climb: 0.3, stepping: true },
      { seconds: 40, stepping: true },
      { seconds: 12, climb: -0.3, stepping: true },
      { seconds: 30, stepping: true },
    ]);
    expect(events.map((e) => e.floors)).toEqual([1, -1]);
  });

  it('starts again after a long gap instead of inventing a change', () => {
    const d = new FloorChangeDetector();
    d.update({ t: 0, pressureHPa: pressureAt(540) });
    d.update({ t: 1, pressureHPa: pressureAt(540) });
    // The app was in the background while the walker changed floor.
    for (let t = 300; t < 330; t++)
      expect(d.update({ t, pressureHPa: pressureAt(547.2) })).toBeNull();
    expect(d.state.relativeMetres).toBeCloseTo(0, 1);
  });
});

const floors = [
  { id: 'g', level: 0 },
  { id: 'l1', level: 1 },
  { id: 'l2', level: 2 },
];
const prob = (b: FloorBelief, id: string) =>
  b.estimate().all.find((f) => f.floorId === id)!.probability;

describe('floor belief', () => {
  it('starts on the known floor and follows a barometer move', () => {
    const b = new FloorBelief(floors, 'g');
    expect(b.estimate().floorId).toBe('g');
    b.moved(1, 0.9);
    expect(b.estimate().floorId).toBe('l1');
    expect(prob(b, 'l1')).toBeGreaterThan(0.75);
    // Some doubt stays on the neighbours.
    expect(prob(b, 'g')).toBeGreaterThan(0.01);
  });

  it('cannot leave the building', () => {
    const b = new FloorBelief(floors, 'l2');
    b.moved(2, 0.9);
    expect(b.estimate().floorId).toBe('l2');
    expect(b.estimate().all.reduce((s, f) => s + f.probability, 0)).toBeCloseTo(
      1,
    );
  });

  it('lets beacons decide when there is no barometer', () => {
    const b = new FloorBelief(floors, 'g');
    for (let i = 0; i < 6; i++)
      b.heard([
        { floorId: 'l1', rssi: -62 },
        { floorId: 'g', rssi: -84 },
      ]);
    expect(b.estimate().floorId).toBe('l1');
    expect(b.estimate().probability).toBeGreaterThan(0.8);
  });

  it('ignores beacons too faint to tell floors apart', () => {
    const b = new FloorBelief(floors, 'g');
    for (let i = 0; i < 10; i++) b.heard([{ floorId: 'l2', rssi: -93 }]);
    expect(b.estimate().floorId).toBe('g');
  });

  it('recovers when the barometer was wrong and the beacons disagree', () => {
    const b = new FloorBelief(floors, 'g');
    b.moved(1, 0.85); // a false floor change
    expect(b.estimate().floorId).toBe('l1');
    for (let i = 0; i < 8; i++)
      b.heard([
        { floorId: 'g', rssi: -58 },
        { floorId: 'l1', rssi: -80 },
      ]);
    expect(b.estimate().floorId).toBe('g');
  });

  it('uses the route only as a nudge, and the walker’s word as near certain', () => {
    const b = new FloorBelief(floors);
    b.expected('l1');
    expect(b.estimate().floorId).toBe('l1');
    expect(b.estimate().probability).toBeLessThan(0.5);
    b.confirmed('l2');
    expect(b.estimate()).toMatchObject({ floorId: 'l2' });
    expect(b.estimate().probability).toBeGreaterThan(0.95);
  });

  it('shows a new floor only when it is clearly more likely', () => {
    const b = new FloorBelief(floors, 'g');
    expect(shownFloor('g', b.estimate())).toEqual({ floorId: 'g', ask: false });
    b.moved(1, 0.6);
    // Leading, but not clearly: keep the map and ask.
    expect(shownFloor('g', b.estimate())).toEqual({ floorId: 'g', ask: true });
    b.heard([
      { floorId: 'l1', rssi: -60 },
      { floorId: 'g', rssi: -82 },
    ]);
    b.heard([
      { floorId: 'l1', rssi: -60 },
      { floorId: 'g', rssi: -82 },
    ]);
    expect(shownFloor('g', b.estimate()).floorId).toBe('l1');
  });
});

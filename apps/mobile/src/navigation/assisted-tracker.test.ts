import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 34 },
  PermissionsAndroid: { PERMISSIONS: {}, requestMultiple: vi.fn() },
}));
vi.mock('expo', () => ({ requireOptionalNativeModule: () => null }));
vi.mock('../fingerprinting/storage', () => ({ saveBleTrace: vi.fn() }));
import { AssistedTracker } from './assisted-tracker';
import {
  predictRssi,
  type BeaconPlacementSet,
  type BleTraceRecord,
  type FusionMap,
} from '@turn/positioning-core';

const map: FusionMap = {
  floorId: 'f',
  walkable: [
    [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 0, y: 10 },
    ],
  ],
  walls: [
    { from: { x: 0, y: 0 }, to: { x: 20, y: 0 } },
    { from: { x: 20, y: 0 }, to: { x: 20, y: 10 } },
    { from: { x: 20, y: 10 }, to: { x: 0, y: 10 } },
    { from: { x: 0, y: 10 }, to: { x: 0, y: 0 } },
  ],
};
const placements: BeaconPlacementSet = {
  schemaVersion: 1,
  venueId: 'v',
  venueRevision: '1',
  deviceProfile: 'p',
  beacons: [
    { tag: 'B1', floorId: 'f', x: 2, y: 8, referenceRssi: -59 },
    { tag: 'B2', floorId: 'f', x: 10, y: 1, referenceRssi: -59 },
    { tag: 'B3', floorId: 'f', x: 18, y: 8, referenceRssi: -59 },
    { tag: 'B4', floorId: 'f', x: 18, y: 2 }, // uncalibrated: must be ignored
  ],
};
let nowMs = 0;
const advance = (ms: number) => {
  nowMs += ms;
  vi.advanceTimersByTime(ms);
};
beforeEach(() => {
  nowMs = 0;
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

function setup() {
  let deliver: (
    s: { t: number; tag: string; rssi: number }[],
    d: number,
  ) => void = () => {};
  const stop = vi.fn();
  const saved: BleTraceRecord[] = [];
  const tracker = new AssistedTracker({
    floorId: 'f',
    map,
    placements,
    platform: 'android',
    navigationSessionId: 'walk-1',
    now: () => nowMs,
    start: async (onSamples) => {
      deliver = onSamples;
      return stop;
    },
    save: (t) => saved.push(t),
  });
  const feed = (x: number, y: number, seconds: number) => {
    // 10 packets per second per beacon at the true position.
    for (let i = 0; i < seconds * 10; i++) {
      advance(100);
      deliver(
        placements.beacons
          .filter((b) => b.referenceRssi !== undefined)
          .map((b) => ({
            t: nowMs / 1000,
            tag: b.tag,
            rssi: predictRssi(
              { refRssi: b.referenceRssi!, exponent: 2.3 },
              Math.hypot(x - b.x, y - b.y),
            ),
          })),
        0,
      );
    }
  };
  return { tracker, feed, stop, saved };
}

it('finds a starting position from beacon signals alone, then tracks walking with fusion', async () => {
  const { tracker, feed, stop, saved } = setup();
  expect(tracker.beaconCount).toBe(3);
  await tracker.begin();
  const located = tracker.locate(6000);
  feed(6, 5, 6);
  const estimate = await located;
  expect(estimate).not.toBeNull();
  expect(Math.hypot(estimate!.x - 6, estimate!.y - 5)).toBeLessThan(3);
  tracker.syncRaw(6, 5);
  for (let i = 1; i <= 10; i++) {
    tracker.walk(6 + i * 0.7, 5);
    feed(6 + i * 0.7, 5, 1);
  }
  const end = tracker.estimate()!;
  expect(Math.hypot(end.x - 13, end.y - 5)).toBeLessThan(3);
  expect(tracker.health()).toHaveLength(3);
  expect(tracker.health()[0]!.silentSeconds).toBeLessThan(1);
  const trace = tracker.finish();
  expect(stop).toHaveBeenCalledOnce();
  expect(trace?.mode).toBe('assist');
  expect(trace?.pdr?.length).toBe(10);
  expect(trace?.fused?.length).toBeGreaterThan(5);
  expect(saved).toHaveLength(1);
  expect(tracker.finish()).toBeNull();
});
it('reports no position when fewer than two beacons are heard, and works without placements', async () => {
  const { tracker } = setup();
  await tracker.begin();
  const located = tracker.locate(1000);
  advance(1000);
  expect(await located).toBeNull();
  const plain = new AssistedTracker({
    floorId: 'f',
    map,
    placements: null,
    platform: 'ios',
    now: () => nowMs,
  });
  await plain.begin();
  plain.setPosition(3, 3, 0.5);
  plain.syncRaw(3, 3);
  plain.walk(4, 3);
  expect(plain.estimate()?.x).toBeGreaterThan(3.3);
  expect(plain.finish()).toBeNull();
});

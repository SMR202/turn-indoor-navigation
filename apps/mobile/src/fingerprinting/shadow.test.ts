import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 34 },
  PermissionsAndroid: { PERMISSIONS: {}, requestMultiple: vi.fn() },
}));
vi.mock('expo', () => ({ requireOptionalNativeModule: () => null }));
vi.mock('./storage', () => ({ saveBleTrace: vi.fn() }));
import { startShadowRecording } from './shadow';
import type {
  BeaconPlacementSet,
  BleTraceRecord,
} from '@turn/positioning-core';

const placements: BeaconPlacementSet = {
  schemaVersion: 1,
  venueId: 'v',
  venueRevision: '1',
  deviceProfile: 'p',
  beacons: [
    {
      tag: 'B1',
      anchorId: 'a1',
      nodeId: 'n1',
      floorId: 'f',
      x: 0,
      y: 0,
      referenceRssi: -60,
    },
    {
      tag: 'B2',
      anchorId: 'a2',
      nodeId: 'n2',
      floorId: 'f',
      x: 10,
      y: 0,
      referenceRssi: -60,
    },
  ],
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('records a shadow event with the estimate and discrepancy, and stops the stream when finished', async () => {
  let deliver: (
    s: { t: number; tag: string; rssi: number }[],
    d: number,
  ) => void = () => {};
  const stop = vi.fn();
  const saved: BleTraceRecord[] = [];
  const recorder = await startShadowRecording({
    placements,
    navigationSessionId: 'walk-1',
    getEstimate: () => ({ floorId: 'f', x: 3, y: 4 }),
    start: async (onSamples) => {
      deliver = onSamples;
      return stop;
    },
    save: (t) => saved.push(t),
  });
  for (let i = 0; i < 40; i++) {
    deliver([{ t: i * 0.1, tag: 'B1', rssi: -57 }], 0);
  }
  expect(recorder.status()).toMatchObject({
    running: true,
    samples: 40,
    events: 1,
  });
  const trace = recorder.finish();
  expect(stop).toHaveBeenCalledOnce();
  expect(trace?.events[0]).toMatchObject({
    tag: 'B1',
    estimate: { floorId: 'f', x: 3, y: 4 },
    discrepancyMetres: 5,
  });
  expect(trace?.navigationSessionId).toBe('walk-1');
  expect(saved).toHaveLength(1);
  expect(recorder.finish()).toBeNull();
});
it('reports a stream failure without throwing and never produces events from silence', async () => {
  let fail: (m: string) => void = () => {};
  const recorder = await startShadowRecording({
    placements,
    getEstimate: () => undefined,
    start: async (_s, onFailure) => {
      fail = onFailure;
      return () => {};
    },
    save: () => {},
  });
  fail('Turn on Bluetooth, then retry.');
  await vi.advanceTimersByTimeAsync(5000);
  expect(recorder.status()).toMatchObject({
    events: 0,
    failure: 'Turn on Bluetooth, then retry.',
  });
  expect(recorder.finish()?.events).toEqual([]);
});

it('summarizes a walk in plain language, including silence and missing estimates', async () => {
  const { summarizeTrace } = await import('./shadow');
  const base = {
    kind: 'ble-trace',
    schemaVersion: 1,
    sessionId: 'ble-trace-1',
    detectorRevision: 'ble-proximity-v1',
    mode: 'shadow',
    startedAt: '2026-10-16T00:00:00.000Z',
    platform: 'android',
    placements,
    config: {
      windowSeconds: 2,
      minSamples: 3,
      nearDeltaDb: 8,
      marginDb: 6,
      holdSeconds: 1,
      releaseDeltaDb: 14,
    },
    droppedSamples: 0,
  } as const;
  const silent = summarizeTrace(
    { ...base, samples: [], events: [] },
    (id) => id,
  );
  expect(silent).toContain('No TURN beacon was heard');
  const heard = summarizeTrace(
    {
      ...base,
      samples: [
        { t: 1, tag: 'B1', rssi: -60 },
        { t: 2, tag: 'B1', rssi: -61 },
      ],
      events: [
        {
          t: 12.4,
          tag: 'B1',
          anchorId: 'a1',
          smoothedRssi: -60,
          referenceRssi: -60,
          marginDb: null,
          runnerUp: null,
          samplesInWindow: 8,
          beacon: { floorId: 'f', x: 0, y: 0 },
          discrepancyMetres: 3.14,
        },
      ],
    },
    (id) => `Spot ${id}`,
  );
  expect(heard).toContain('Heard B1 ×2');
  expect(heard).toContain(
    'B1 near Spot a1 at 12 s: your estimate was 3.1 m from it',
  );
});

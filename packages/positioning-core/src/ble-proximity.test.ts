import { expect, it } from 'vitest';
import {
  ProximityDetector,
  bleTraceRecordSchema,
  replayBleTrace,
  type BeaconPlacement,
  type BleStreamSample,
  type BleTraceRecord,
} from './ble-proximity';

const placements: BeaconPlacement[] = [
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
  {
    tag: 'B3',
    anchorId: 'a3',
    nodeId: 'n3',
    floorId: 'f',
    x: 20,
    y: 0,
    referenceRssi: -60,
  },
];
// Log-distance model with a deterministic ripple; the walker moves 1 m/s along x.
function walk(seconds: number, seed = 1) {
  const out: BleStreamSample[] = [];
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 4; // ±2 dB
  for (let t = 0; t <= seconds; t += 0.1)
    for (const p of placements) {
      const d = Math.max(0.5, Math.abs(t - p.x));
      const rssi = -60 - 20 * Math.log10(d) + rnd();
      if (rssi > -90)
        out.push({ t: Math.round(t * 10) / 10, tag: p.tag, rssi });
    }
  return out;
}
function run(samples: BleStreamSample[], list = placements) {
  const detector = new ProximityDetector(list);
  const events = [];
  let next = 0.5;
  for (const s of samples) {
    while (s.t >= next) {
      const e = detector.evaluate(next);
      if (e) events.push(e);
      next += 0.5;
    }
    detector.push(s);
  }
  return events;
}

it('emits one entry per beacon as the walker passes each, in order', () => {
  const events = run(walk(22));
  expect(events.map((e) => e.tag)).toEqual(['B1', 'B2', 'B3']);
  for (const e of events) {
    expect(e.smoothedRssi).toBeGreaterThanOrEqual(e.referenceRssi - 8);
    expect(e.samplesInWindow).toBeGreaterThanOrEqual(3);
  }
});
it('does not fire between beacons or when two beacons are equally strong', () => {
  const mid = Array.from({ length: 100 }, (_, i) =>
    (['B1', 'B2'] as const).map((tag) => ({
      t: i * 0.1,
      tag,
      rssi: -62 + (i % 2),
    })),
  ).flat();
  expect(run(mid)).toEqual([]);
  const far = Array.from({ length: 100 }, (_, i) => ({
    t: i * 0.1,
    tag: 'B1',
    rssi: -82,
  }));
  expect(run(far)).toEqual([]);
});
it('ignores uncalibrated beacons and sparse single packets', () => {
  const list = placements.map((p) => ({ ...p, referenceRssi: undefined }));
  expect(run(walk(22), list)).toEqual([]);
  expect(
    run([
      { t: 1, tag: 'B1', rssi: -55 },
      { t: 3, tag: 'B1', rssi: -55 },
    ]),
  ).toEqual([]);
});
it('stays quiet while lingering and re-arms after leaving', () => {
  const linger = Array.from({ length: 120 }, (_, i) => ({
    t: i * 0.1,
    tag: 'B1',
    rssi: -58,
  }));
  expect(run(linger)).toHaveLength(1);
  const leaveAndReturn = [
    ...linger,
    ...Array.from({ length: 60 }, (_, i) => ({
      t: 12 + i * 0.1,
      tag: 'B1',
      rssi: -85,
    })),
    ...Array.from({ length: 60 }, (_, i) => ({
      t: 18 + i * 0.1,
      tag: 'B1',
      rssi: -58,
    })),
  ];
  expect(run(leaveAndReturn)).toHaveLength(2);
});
it('replays a recorded trace to the same events and validates the record', () => {
  const samples = walk(22);
  const events = run(samples);
  const trace: BleTraceRecord = {
    kind: 'ble-trace',
    schemaVersion: 1,
    sessionId: 'ble-trace-1',
    detectorRevision: 'ble-proximity-v1',
    mode: 'shadow',
    startedAt: '2026-10-16T00:00:00.000Z',
    platform: 'android',
    placements: {
      schemaVersion: 1,
      venueId: 'v',
      venueRevision: '1',
      deviceProfile: 'p',
      beacons: placements,
    },
    config: {
      windowSeconds: 2,
      minSamples: 3,
      nearDeltaDb: 8,
      marginDb: 6,
      holdSeconds: 1,
      releaseDeltaDb: 14,
    },
    samples,
    events: events.map((e) => ({
      ...e,
      beacon: { floorId: 'f', x: 0, y: 0 },
      discrepancyMetres: null,
    })),
    droppedSamples: 0,
  };
  expect(bleTraceRecordSchema.safeParse(trace).success).toBe(true);
  expect(replayBleTrace(trace).map((e) => [e.tag, e.t])).toEqual(
    events.map((e) => [e.tag, e.t]),
  );
  expect(
    bleTraceRecordSchema.safeParse({
      ...trace,
      samples: [...samples].reverse(),
    }).success,
  ).toBe(false);
});

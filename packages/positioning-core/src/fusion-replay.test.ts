import { expect, it } from 'vitest';
import { replayAssistedTrace } from './fusion-replay';
import { predictRssi, type FusionMap } from './fusion';
import type { BleTraceRecord } from './ble-proximity';

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
  walls: [],
};
const beacons = [
  { tag: 'B1', floorId: 'f', x: 2, y: 8, referenceRssi: -59 },
  { tag: 'B2', floorId: 'f', x: 10, y: 1, referenceRssi: -59 },
  { tag: 'B3', floorId: 'f', x: 18, y: 8, referenceRssi: -59 },
];
function makeTrace(): { trace: BleTraceRecord; end: { x: number; y: number } } {
  // Truth: walk east along y = 5 from x = 3 to x = 15 at 1 m/s. The walking sensor over-reports distance by 12%.
  const pdr = [];
  const samples = [];
  for (let t = 0; t <= 12; t++) {
    pdr.push({ t, x: 3 + t * 1.12, y: 5 });
    for (let k = 0; k < 10; k++)
      for (const b of beacons)
        samples.push({
          t: t + k / 10,
          tag: b.tag,
          rssi: predictRssi(
            { refRssi: -59, exponent: 2.3 },
            Math.hypot(3 + t - b.x, 5 - b.y),
          ),
        });
  }
  return {
    end: { x: 15, y: 5 },
    trace: {
      kind: 'ble-trace',
      schemaVersion: 1,
      sessionId: 'ble-trace-1',
      detectorRevision: 'ble-proximity-v1',
      mode: 'assist',
      startedAt: '2026-10-16T00:00:00.000Z',
      platform: 'android',
      placements: {
        schemaVersion: 1,
        venueId: 'v',
        venueRevision: '1',
        deviceProfile: 'p',
        beacons,
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
      events: [],
      droppedSamples: 0,
      pdr,
      fused: [{ t: 0, x: 3, y: 5, sigma: 0.8 }],
    },
  };
}
it('re-runs a recorded walk deterministically and pulls the drifting walking estimate toward the beacons', () => {
  const { trace, end } = makeTrace();
  const a = replayAssistedTrace(trace, map, { seed: 4 });
  const b = replayAssistedTrace(trace, map, { seed: 4 });
  expect(a.path).toEqual(b.path);
  const last = a.path.at(-1)!;
  const rawEnd = trace.pdr!.at(-1)!;
  const rawError = Math.hypot(rawEnd.x - end.x, rawEnd.y - end.y);
  expect(rawError).toBeGreaterThan(1.3);
  expect(Math.hypot(last.x - end.x, last.y - end.y)).toBeLessThan(rawError);
});
it('returns nothing for a trace without walking data', () => {
  const { trace } = makeTrace();
  expect(replayAssistedTrace({ ...trace, pdr: [] }, map).path).toEqual([]);
});

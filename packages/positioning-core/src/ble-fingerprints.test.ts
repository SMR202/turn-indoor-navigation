import { expect, it } from 'vitest';
import {
  fingerprintCaptureSchema,
  matchFingerprint,
  type FingerprintCapture,
  type FingerprintSurvey,
} from './fingerprints';

// Each station is closest to its own beacon; magnetic strength is deliberately identical
// so only BLE can distinguish the places.
function cap(
  id: string,
  rssi: Record<string, number>,
  opts: { magnetic?: number; ble?: boolean } = {},
): FingerprintCapture {
  return {
    id,
    createdAt: '2026-10-15T00:00:00.000Z',
    platform: 'android',
    deviceProfile: 'p',
    durationSeconds: 8,
    magnetic: Array.from({ length: 80 }, (_, i) => ({
      t: i / 10,
      x: opts.magnetic ?? 40,
      y: 0,
      z: 0,
    })),
    wifi: [],
    wifiStatus: 'not selected',
    ...(opts.ble === false
      ? {}
      : {
          ble: Object.entries(rssi).map(([beacon, level]) => ({
            id: beacon,
            samples: Array.from({ length: 20 }, (_, i) => ({
              t: i * 0.3,
              rssi: level + (i % 3) - 1,
            })),
          })),
          bleStatus: 'Fresh BLE scan',
        }),
  };
}
const near = (b: string) =>
  ({
    A: { A: -52, B: -80, C: -88 },
    B: { A: -82, B: -50, C: -79 },
    C: { A: -90, B: -78, C: -55 },
  })[b]!;
function survey(withBle = true): FingerprintSurvey {
  return {
    schemaVersion: 1,
    revision: 'station-fingerprint-v1',
    venueId: 'v',
    venueRevision: '1',
    deviceProfile: 'p',
    stations: ['A', 'B', 'C'].map((b, i) => ({
      anchorId: `a${b}`,
      nodeId: `n${b}`,
      name: `Place ${b}`,
      floorId: 'f',
      x: i,
      y: 0,
      captures: [
        cap(`${b}1`, near(b), { ble: withBle }),
        cap(
          `${b}2`,
          Object.fromEntries(
            Object.entries(near(b)).map(([k, v]) => [k, v + 1]),
          ),
          { ble: withBle },
        ),
      ],
    })),
  };
}

it('identifies places by beacon strength when magnetic fields are identical', () => {
  const s = survey();
  for (const b of ['A', 'B', 'C']) {
    const m = matchFingerprint(s, cap(`q${b}`, near(b)), 'station-rank-v3');
    expect(m.anchorId).toBe(`a${b}`);
    expect(m.confidence).toBe('clear');
    expect(m.method).toBe('magnetic-ble');
  }
  // The same readings are indistinguishable without BLE, proving the radio drives the result.
  const noBle = matchFingerprint(
    s,
    cap('qn', near('A'), { ble: false }),
    'station-rank-v3',
  );
  expect(noBle.anchorId).toBeNull();
});
it('treats an unheard surveyed beacon as absent and abstains between equally distant places', () => {
  const s = survey();
  const m = matchFingerprint(
    s,
    cap('mid', { A: -70, B: -70, C: -70 }),
    'station-rank-v3',
  );
  expect(m.anchorId).toBeNull();
  const silent = matchFingerprint(s, cap('quiet', {}), 'station-rank-v3');
  expect(silent.method).toBe('magnetic'); // nothing heard: BLE unusable, falls back
  expect(silent.anchorId).toBeNull();
});
it('does not mix survey passes without BLE with a BLE query', () => {
  const m = matchFingerprint(
    survey(false),
    cap('q', near('A')),
    'station-rank-v3',
  );
  expect(m.method).toBe('magnetic');
});
it('keeps historical revisions independent of BLE data', () => {
  const m = matchFingerprint(survey(), cap('q', near('A')), 'station-rank-v2');
  expect(m.method).toBe('magnetic');
});
it('validates beacon identifiers and rejects duplicates', () => {
  const c = cap('d', near('A'));
  expect(fingerprintCaptureSchema.safeParse(c).success).toBe(true);
  expect(
    fingerprintCaptureSchema.safeParse({ ...c, ble: [c.ble![0], c.ble![0]] })
      .success,
  ).toBe(false);
  expect(
    fingerprintCaptureSchema.safeParse({
      ...c,
      ble: [{ ...c.ble![0], id: 'bad id!' }],
    }).success,
  ).toBe(false);
});

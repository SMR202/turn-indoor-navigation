import { expect, it } from 'vitest';
import {
  evaluateFingerprint,
  fingerprintCaptureSchema,
  fingerprintRecordSchema,
  matchFingerprint,
  type FingerprintCapture,
  type FingerprintSurvey,
} from './fingerprints';

export function capture(id: string, strength: number): FingerprintCapture {
  return {
    id,
    createdAt: '2026-10-10T00:00:00.000Z',
    platform: 'android',
    deviceProfile: 'test-profile',
    durationSeconds: 8,
    magnetic: Array.from({ length: 80 }, (_, i) => ({
      t: i / 10,
      x: strength,
      y: 0,
      z: 0,
    })),
    wifi: [],
    wifiStatus: 'not selected',
  };
}
export function survey(strengths = [30, 50, 70]): FingerprintSurvey {
  return {
    schemaVersion: 1,
    revision: 'station-fingerprint-v1',
    venueId: 'demo',
    venueRevision: '1',
    deviceProfile: 'test-profile',
    stations: strengths.map((s, i) => ({
      anchorId: `a${i}`,
      nodeId: `n${i}`,
      name: `Place ${i}`,
      floorId: 'ground',
      x: i * 5,
      y: 0,
      captures: [capture(`s${i}-1`, s), capture(`s${i}-2`, s + 0.1)],
    })),
  };
}
it('recognizes a held-out station independently of orientation and evaluation labels', () => {
  const s = survey();
  const test = capture('query', 50.2);
  test.magnetic.forEach((v) => {
    v.y = v.x;
    v.x = 0;
  });
  const base = {
    kind: 'fingerprint' as const,
    schemaVersion: 1 as const,
    sessionId: 'fingerprint-1',
    survey: s,
    test,
  };
  const right = evaluateFingerprint({ ...base, actualAnchorId: 'a1' });
  const wrong = evaluateFingerprint({ ...base, actualAnchorId: 'a0' });
  expect(right?.match.anchorId).toBe('a1');
  expect(right?.correct).toBe(true);
  expect(wrong?.match).toEqual(right?.match);
  expect(wrong?.errorMetres).toBe(5);
  expect(evaluateFingerprint(JSON.parse(JSON.stringify(base)))?.match).toEqual(
    right?.match,
  );
});
it('abstains on similar places and out-of-survey magnetic values', () => {
  expect(matchFingerprint(survey([50, 51, 52]), capture('q', 50)).status).toBe(
    'ambiguous',
  );
  expect(matchFingerprint(survey(), capture('q', 140)).anchorId).toBeNull();
});
it('requires repeated survey coverage, correct profile and independent test samples', () => {
  const s = survey();
  expect(matchFingerprint(s, s.stations[0]!.captures[0]!).status).toBe(
    'unavailable',
  );
  expect(
    matchFingerprint(s, { ...capture('q', 50), deviceProfile: 'other-phone' })
      .status,
  ).toBe('unavailable');
  s.stations[0]!.captures.pop();
  expect(matchFingerprint(s, capture('q', 50)).status).toBe('unavailable');
});
it('rejects sparse, unstable, duplicate and invalid-clock capture data', () => {
  const q = capture('q', 50);
  q.magnetic.forEach((v, i) => {
    v.x += i % 2 ? 30 : -30;
  });
  expect(matchFingerprint(survey(), q).status).toBe('unavailable');
  expect(
    fingerprintCaptureSchema.safeParse({
      ...q,
      magnetic: q.magnetic.slice(0, 10),
    }).success,
  ).toBe(false);
  q.magnetic[1]!.t = 0;
  expect(fingerprintCaptureSchema.safeParse(q).success).toBe(false);
  const s = survey();
  expect(
    fingerprintRecordSchema.safeParse({
      kind: 'fingerprint',
      schemaVersion: 1,
      sessionId: 'f',
      survey: s,
      test: s.stations[0]!.captures[0],
    }).success,
  ).toBe(false);
});
it('does not manufacture a winner by discarding unstable competing places', () => {
  const s = survey();
  s.stations[1]!.captures[1]!.magnetic.forEach((v) => {
    v.x += 40;
  });
  expect(matchFingerprint(s, capture('q', 30)).status).toBe('unavailable');
});
it('uses Wi-Fi to distinguish similar magnetic locations and falls back when scans are absent', () => {
  const s = survey([50, 50, 50]);
  const wifi = (base: number) =>
    [0, 1, 2].map((n) => ({
      id: String(n).repeat(64),
      rssi: base - n,
      ageSeconds: 1,
      frequencyMHz: 2412,
    }));
  s.stations.forEach((p, i) =>
    p.captures.forEach((c) => {
      c.wifi = wifi(-30 - i * 25);
    }),
  );
  const q = { ...capture('q', 50), wifi: wifi(-55) };
  const match = matchFingerprint(s, q);
  expect(match.method).toBe('magnetic-wifi');
  expect(match.anchorId).toBe('a1');
  expect(matchFingerprint(s, { ...q, wifi: [] }).status).toBe('ambiguous');
  q.wifi[0]!.ageSeconds = 30;
  expect(fingerprintCaptureSchema.safeParse(q).success).toBe(false);
});

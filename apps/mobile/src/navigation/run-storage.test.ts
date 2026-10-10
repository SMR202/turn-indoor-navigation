import { beforeEach, expect, it, vi } from 'vitest';
import type { Recording } from '@turn/positioning-core';
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('expo-file-system', () => ({
  Directory: class {},
  File: class {},
  Paths: {},
}));
import { listRuns, readRun, saveRun } from './run-storage';
beforeEach(() => {
  const data: Record<string, string> = {};
  Object.defineProperties(data, {
    getItem: { value: (key: string) => data[key] ?? null },
    setItem: {
      value: (key: string, value: string) => {
        data[key] = value;
      },
    },
  });
  vi.stubGlobal('localStorage', data);
});
const fixture: Recording = {
  schemaVersion: 1,
  algorithm: 'step-yaw-v1',
  sessionId: 'walk-123',
  stepLengthMetres: 0.5,
  metadata: {
    platform: 'synthetic',
    osVersion: 'none',
    timestampBasis: 'native-boot-seconds-minus-session-origin',
    note: '',
  },
  observations: [],
};
it('persists independent snapshots and round-trips run annotations', async () => {
  const r = structuredClone(fixture);
  r.labels = {
    mode: 'walk',
    pace: 'brisk',
    manualSteps: 10,
    phoneModel: '',
    notes: 'test',
  };
  saveRun(r);
  r.labels.manualSteps = 9;
  saveRun({ ...r, sessionId: 'walk-124' });
  expect(await listRuns()).toEqual([
    'turn-run-v1-walk-124.json',
    'turn-run-v1-walk-123.json',
  ]);
  expect((await readRun('turn-run-v1-walk-123.json')).labels?.manualSteps).toBe(
    10,
  );
});
it('rejects unsafe paths and corrupted records, and surfaces storage failures', async () => {
  expect(() => saveRun({ ...fixture, sessionId: '../bad' })).toThrow();
  await expect(readRun('../bad.json')).rejects.toThrow();
  localStorage.setItem('turn-run-v1-bad.json', '{}');
  await expect(readRun('turn-run-v1-bad.json')).rejects.toThrow();
  vi.stubGlobal('localStorage', {
    setItem: () => {
      throw new Error('Quota exceeded');
    },
  });
  expect(() => saveRun(fixture)).toThrow('Quota exceeded');
});

it('preserves the provenance of a confirmed fingerprint correction in the next walking segment', async () => {
  const positionFix = {
    source: 'user-confirmed-fingerprint' as const,
    fingerprintSessionId: 'fingerprint-123',
    matcherRevision: 'station-rank-v2' as const,
    anchorId: 'entry-qr',
    confidence: 'tentative' as const,
    confirmedAt: '2026-10-10T00:00:00.000Z',
    previousSessionId: 'walk-122',
    previousPosition: { floorId: 'ground', x: 4, y: 5 },
  };
  saveRun({ ...fixture, positionFix });
  expect((await readRun('turn-run-v1-walk-123.json')).positionFix).toEqual(
    positionFix,
  );
});

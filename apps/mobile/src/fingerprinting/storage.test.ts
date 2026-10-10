import { beforeEach, expect, it, vi } from 'vitest';
import type { FingerprintRecord } from '@turn/positioning-core';

const fs = vi.hoisted(() => ({ data: new Map<string, string>(), fail: '' }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts
        .map((p) => (typeof p === 'string' ? p : p.uri))
        .join('/');
    }
    get name() {
      return this.uri.split('/').at(-1)!;
    }
    get exists() {
      return fs.data.has(this.uri);
    }
    create() {
      fs.data.set(this.uri, '');
    }
    write(value: string) {
      fs.data.set(this.uri, value);
    }
    textSync() {
      if (!this.exists) throw new Error('missing file');
      return fs.data.get(this.uri)!;
    }
    delete() {
      fs.data.delete(this.uri);
    }
    copySync(to: File) {
      if (fs.fail === 'copy') throw new Error('copy failed');
      fs.data.set(to.uri, this.textSync());
    }
    moveSync(to: File) {
      if (fs.fail === 'move') throw new Error('move failed');
      fs.data.set(to.uri, this.textSync());
      this.delete();
      this.uri = to.uri;
    }
    // Calling the asynchronous API is a regression, even if it happens to finish quickly.
    copy() {
      throw new Error('unawaited copy');
    }
    move() {
      throw new Error('unawaited move');
    }
  }
  class Directory extends File {
    get exists() {
      return true;
    }
    create() {}
    list() {
      return [...fs.data.keys()]
        .filter((k) => k.startsWith(`${this.uri}/`))
        .map((k) => new File(k));
    }
  }
  return { File, Directory, Paths: { document: 'document' } };
});
import {
  fingerprintProfile,
  loadFingerprintRecords,
  saveFingerprintRecord,
} from './storage';
const record: FingerprintRecord = {
  kind: 'fingerprint',
  schemaVersion: 1,
  sessionId: 'fingerprint-test',
  survey: {
    schemaVersion: 1,
    revision: 'station-fingerprint-v1',
    venueId: 'test',
    venueRevision: '1',
    deviceProfile: 'device',
    stations: [],
  },
};
beforeEach(() => {
  fs.data.clear();
  fs.fail = '';
});

it('completes repeated native replacements before returning and keeps one visible record', () => {
  const profile = fingerprintProfile();
  saveFingerprintRecord(record);
  const revised = { ...record, matcherRevision: 'station-rank-v2' as const };
  saveFingerprintRecord(revised);
  expect(loadFingerprintRecords()).toEqual([revised]);
  expect(fingerprintProfile()).toBe(profile);
  expect([...fs.data.keys()].some((k) => k.endsWith('.pending'))).toBe(false);
});
it('surfaces copy failure without deleting the last saved record', () => {
  saveFingerprintRecord(record);
  fs.fail = 'copy';
  expect(() =>
    saveFingerprintRecord({ ...record, matcherRevision: 'station-rank-v2' }),
  ).toThrow('copy failed');
  expect(loadFingerprintRecords()).toEqual([record]);
});
it('recovers a backup-only record after replacement failure and permits a retry', () => {
  saveFingerprintRecord(record);
  fs.fail = 'move';
  const next = { ...record, matcherRevision: 'station-rank-v2' as const };
  expect(() => saveFingerprintRecord(next)).toThrow('move failed');
  expect(loadFingerprintRecords()).toEqual([record]);
  fs.fail = '';
  saveFingerprintRecord(next);
  expect(loadFingerprintRecords()).toEqual([next]);
});

import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import {
  beaconPlacementSetSchema,
  bleTraceRecordSchema,
  type BeaconPlacementSet,
  type BleTraceRecord,
  fingerprintRecordSchema,
  fingerprintSurveySchema,
  type FingerprintRecord,
  type FingerprintSurvey,
} from '@turn/positioning-core';

function read(name: string) {
  if (Platform.OS === 'web') return localStorage.getItem(name);
  const file = new File(Paths.document, 'turn-fingerprints', `${name}.json`);
  if (file.exists) return file.textSync();
  const backup = new File(
    Paths.document,
    'turn-fingerprints',
    `${name}.backup`,
  );
  return backup.exists ? backup.textSync() : null;
}
function write(name: string, value: string) {
  if (Platform.OS === 'web') {
    localStorage.setItem(name, value);
    return;
  }
  const dir = new Directory(Paths.document, 'turn-fingerprints');
  dir.create({ intermediates: true, idempotent: true });
  const pending = new File(dir, `${name}.pending`);
  pending.create({ overwrite: true });
  pending.write(value);
  const final = new File(dir, `${name}.json`);
  // Keep a recoverable last-good copy if a replacement is interrupted.
  if (final.exists) {
    const backup = new File(dir, `${name}.backup`);
    if (backup.exists) backup.delete();
    // SDK 57 copy()/move() are asynchronous. Keep this transaction ordered so
    // callers cannot delete the source or report success before it completes.
    final.copySync(backup);
    final.delete();
  }
  pending.moveSync(final);
}
export function fingerprintProfile() {
  let profile = read('profile');
  if (!profile) {
    profile = `phone-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    write('profile', profile);
  }
  return profile;
}
export function loadSurvey(
  venueId: string,
  revision: string,
): FingerprintSurvey | null {
  const raw = read('survey');
  if (!raw) return null;
  const s = fingerprintSurveySchema.parse(JSON.parse(raw));
  return s.venueId === venueId && s.venueRevision === revision ? s : null;
}
export function saveSurvey(survey: FingerprintSurvey) {
  write('survey', JSON.stringify(fingerprintSurveySchema.parse(survey)));
}
export function saveFingerprintRecord(record: FingerprintRecord) {
  const value = fingerprintRecordSchema.parse(record);
  if (!/^fingerprint-[a-z0-9-]+$/.test(value.sessionId))
    throw new Error('Invalid fingerprint record identifier.');
  write(value.sessionId, JSON.stringify(value));
}
export function loadFingerprintRecords(): FingerprintRecord[] {
  const names =
    Platform.OS === 'web'
      ? Object.keys(localStorage)
      : (() => {
          const dir = new Directory(Paths.document, 'turn-fingerprints');
          return dir.exists
            ? dir
                .list()
                .filter(
                  (f) => f instanceof File && /\.(json|backup)$/.test(f.name),
                )
                .map((f) => f.name.replace(/\.(json|backup)$/, ''))
            : [];
        })();
  return [...new Set(names)]
    .filter((n) => /^fingerprint-[a-z0-9-]+$/.test(n))
    .sort()
    .reverse()
    .map((n) => fingerprintRecordSchema.parse(JSON.parse(read(n)!)));
}

export function loadPlacements(
  venueId: string,
  revision: string,
): BeaconPlacementSet | null {
  const raw = read('beacon-placements');
  if (!raw) return null;
  const parsed = beaconPlacementSetSchema.safeParse(JSON.parse(raw));
  return parsed.success &&
    parsed.data.venueId === venueId &&
    parsed.data.venueRevision === revision
    ? parsed.data
    : null;
}
export function savePlacements(set: BeaconPlacementSet) {
  write(
    'beacon-placements',
    JSON.stringify(beaconPlacementSetSchema.parse(set)),
  );
}
const MAX_SAVED_TRACES = 30;
export function deleteBleTrace(sessionId: string) {
  if (!/^ble-trace-[a-z0-9-]+$/.test(sessionId)) return;
  if (Platform.OS === 'web') {
    localStorage.removeItem(sessionId);
    return;
  }
  const dir = new Directory(Paths.document, 'turn-fingerprints');
  for (const ext of ['json', 'backup', 'pending']) {
    const f = new File(dir, `${sessionId}.${ext}`);
    if (f.exists) f.delete();
  }
}
export function saveBleTrace(trace: BleTraceRecord) {
  const value = bleTraceRecordSchema.parse(trace);
  // A walk that heard nothing and fired nothing carries no evidence worth keeping or sending.
  if (
    value.samples.length === 0 &&
    value.events.length === 0 &&
    !value.fused?.length
  )
    return;
  write(value.sessionId, JSON.stringify(value));
  // Bound local storage: keep the newest traces only; older ones are never needed on the phone.
  try {
    for (const old of loadBleTraces().slice(MAX_SAVED_TRACES))
      deleteBleTrace(old.sessionId);
  } catch {
    // Pruning is best effort.
  }
}
export function loadBleTraces(): BleTraceRecord[] {
  const names =
    Platform.OS === 'web'
      ? Object.keys(localStorage)
      : (() => {
          const dir = new Directory(Paths.document, 'turn-fingerprints');
          return dir.exists
            ? dir
                .list()
                .filter(
                  (f) => f instanceof File && /.(json|backup)$/.test(f.name),
                )
                .map((f) => f.name.replace(/.(json|backup)$/, ''))
            : [];
        })();
  return [...new Set(names)]
    .filter((n) => /^ble-trace-[a-z0-9-]+$/.test(n))
    .sort()
    .reverse()
    .map((n) => bleTraceRecordSchema.parse(JSON.parse(read(n)!)));
}

import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { BLE_BEACON_ID, type FingerprintCapture } from '@turn/positioning-core';

export type BleReadings = NonNullable<FingerprintCapture['ble']>;
export type BleScanResult = {
  status: string;
  /** False for permission/hardware/lifecycle failures: no evidence, not "heard nothing". */
  completed: boolean;
  readings: BleReadings;
};
export type BleCapabilities = {
  sdk: number;
  bluetoothOn: boolean;
  canScan: boolean;
  canAdvertise: boolean;
  locationOn: boolean;
};
export type BeaconPower = 'high' | 'medium' | 'low';

type StreamEvent = {
  token: string;
  samples: {
    t: number;
    id: string;
    rssi: number;
    alt?: string[];
    key?: string;
    info?: Record<string, unknown>;
  }[];
  dropped: number;
  failure?: string;
  /** iOS: non-fatal problems, such as iBeacon ranging without location permission. */
  notices?: string[];
};
type Native = {
  revision: string;
  capabilities(): BleCapabilities;
  scan(durationMs: number): Promise<BleScanResult>;
  cancelScan(): void;
  startAdvertising(
    tag: string,
    power: BeaconPower,
  ): Promise<{ advertising: boolean; tag: string }>;
  stopAdvertising(): void;
  startStream(token: string): Promise<{ token: string }>;
  /** Build 7 / iOS IPA 3: discovery mode and iBeacon UUIDs to range on iOS. */
  startStreamWith?(
    token: string,
    discover: boolean,
    uuids: string[],
  ): Promise<{ token: string }>;
  stopStream(): void;
  addListener(
    event: 'onSamples',
    listener: (e: StreamEvent) => void,
  ): { remove(): void };
  advertisingState(): { advertising: boolean; tag: string | null };
};

const native = requireOptionalNativeModule<Native>('TurnBle');
// Feature-detect by method: other mocked/optional modules must not be mistaken for BLE support.
// Scanning exists on Android and iOS; advertising only on Android.
const ble =
  (Platform.OS === 'android' || Platform.OS === 'ios') &&
  native &&
  typeof native.scan === 'function' &&
  typeof native.capabilities === 'function'
    ? native
    : null;
export const bleBuildAvailable = Boolean(ble);
export const bleCanAdvertise =
  Platform.OS === 'android' && typeof native?.startAdvertising === 'function';

export function bleCapabilities(): BleCapabilities | null {
  try {
    return ble ? ble.capabilities() : null;
  } catch {
    return null;
  }
}

/** Requests only what Android needs for the requested use; returns a user-facing failure or null. */
export async function requestBlePermissions(
  use: 'scan' | 'advertise',
): Promise<string | null> {
  if (!ble)
    return 'Install the latest TURN development build to use BLE beacons';
  // iOS asks for Bluetooth access itself the first time a scan starts.
  if (Platform.OS === 'ios')
    return use === 'scan' ? null : 'iPhone cannot act as a beacon';
  const P = PermissionsAndroid.PERMISSIONS;
  const needed: string[] = [P.ACCESS_FINE_LOCATION];
  if (Number(Platform.Version) >= 31)
    needed.push(
      use === 'scan' ? P.BLUETOOTH_SCAN : P.BLUETOOTH_ADVERTISE,
      P.BLUETOOTH_CONNECT,
    );
  const result = await PermissionsAndroid.requestMultiple(needed as never[]);
  const denied = needed.filter(
    (p) => (result as Record<string, string>)[p] !== 'granted',
  );
  return denied.length
    ? use === 'scan'
      ? 'Beacon scanning needs Nearby devices and precise location permission'
      : 'Acting as a beacon needs Nearby devices permission'
    : null;
}

/** One foreground scan for TURN beacons only. Cancellation resolves as a failed (not empty) scan. */
export async function scanBeacons(
  durationMs: number,
  signal?: AbortSignal,
): Promise<BleScanResult> {
  const failure = (status: string): BleScanResult => ({
    status,
    completed: false,
    readings: [],
  });
  if (!ble)
    return failure('Install the latest TURN development build to scan beacons');
  const denied = await requestBlePermissions('scan');
  if (denied) return failure(denied);
  if (signal?.aborted) return failure('BLE scan cancelled.');
  const cancel = () => ble.cancelScan();
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const result = await ble.scan(durationMs);
    return {
      status: String(result.status),
      completed: Boolean(result.completed),
      readings: (result.readings ?? []).filter((b) => BLE_BEACON_ID.test(b.id)),
    };
  } catch (e) {
    return failure(e instanceof Error ? e.message : String(e));
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}

export async function startBeacon(tag: string, power: BeaconPower) {
  if (!ble || !bleCanAdvertise || !native)
    throw new Error('Only the Android TURN build can act as a beacon.');
  if (!BLE_BEACON_ID.test(tag))
    throw new Error('Beacon names use 1–12 letters or digits.');
  const denied = await requestBlePermissions('advertise');
  if (denied) throw new Error(denied);
  return native.startAdvertising(tag, power);
}
export function stopBeacon() {
  ble?.stopAdvertising();
}
export function beaconState() {
  try {
    return ble?.advertisingState() ?? { advertising: false, tag: null };
  } catch {
    return { advertising: false, tag: null };
  }
}

export type BeaconKind = 'turn' | 'eddystone' | 'ibeacon' | 'other';
/** What a frame says about the device (setup screen only, never stored). */
export type BeaconInfo = {
  kind: BeaconKind;
  name?: string;
  uuid?: string;
  major?: number;
  minor?: number;
  namespace?: string;
  /** Calibrated power in the frame (dBm; iBeacon: at 1 m, Eddystone: at 0 m). */
  tx?: number;
  company?: number;
  /** iOS: how many ranged iBeacons share this identity (they cannot be told apart). */
  shared?: number;
};
export type StreamSample = {
  t: number;
  tag: string;
  rssi: number;
  /** Other tags the same advertisement answers to (device address, advertised name). */
  alt?: string[];
  /** Discovery only: a per-phone device key and frame details. */
  key?: string;
  info?: BeaconInfo;
};

/**
 * iBeacon proximity UUIDs ranged on iPhone (iOS only exposes iBeacon to apps that name the UUID).
 * Factory defaults of common beacon makers, including the AirLocate sample UUID that April Brother
 * and many others ship with; venue layouts can add their own.
 */
export const DEFAULT_IBEACON_UUIDS = [
  'E2C56DB5-DFFB-48D2-B060-D0F5A71096E0',
  'B5B182C7-EAB1-4988-AA99-B5C1517008D9',
  'FDA50693-A4E2-4FB1-AFCF-C6EB07647825',
  'B9407F30-F5F8-466E-AFF9-25556B57FE6D',
  'F7826DA6-4FA2-4E98-8024-BC5B71E0893E',
  '2F234454-CF6D-4A0F-ADF2-F4911BA9FFA6',
  '5A4BCFCE-174E-4BAC-A814-092E77F6B7E5',
  '74278BDA-B644-4520-8F0C-720EAF059935',
];
const UUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;

type Subscriber = {
  onSamples: (samples: StreamSample[], dropped: number) => void;
  onFailure: (message: string) => void;
  onNotice?: (notices: string[]) => void;
  discover: boolean;
};
const subscribers = new Set<Subscriber>();
const extraUuids = new Set<string>();
let running: { token: string; discover: boolean; uuids: string } | null = null;
let listener: { remove(): void } | null = null;
let chain: Promise<void> = Promise.resolve();
let lastFailure: string | null = null;

// The native stream stops when the app leaves the foreground; start it again on return.
let watchingAppState = false;
function watchAppState() {
  if (watchingAppState || typeof AppState?.addEventListener !== 'function')
    return;
  watchingAppState = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      if (subscribers.size && !running) void reconcile().catch(() => undefined);
    } else if (state === 'background') running = null;
  });
}

/** Adds iBeacon UUIDs to range on iPhone (from a venue's layout). */
export function registerIBeaconUuids(uuids: string[]) {
  const before = extraUuids.size;
  for (const u of uuids)
    if (UUID.test(u.toUpperCase())) extraUuids.add(u.toUpperCase());
  if (extraUuids.size !== before) void reconcile();
}

function wantedUuids() {
  return [...new Set([...DEFAULT_IBEACON_UUIDS, ...extraUuids])].slice(0, 20);
}

function deliver(e: StreamEvent) {
  if (!running || e.token !== running.token) return;
  if (e.failure) {
    lastFailure = e.failure;
    running = null;
    for (const s of subscribers) s.onFailure(e.failure);
    return;
  }
  if (e.notices?.length) for (const s of subscribers) s.onNotice?.(e.notices);
  const samples: StreamSample[] = [];
  for (const s of e.samples) {
    if (
      !BLE_BEACON_ID.test(s.id) ||
      !Number.isFinite(s.t) ||
      !Number.isFinite(s.rssi)
    )
      continue;
    const sample: StreamSample = { t: s.t, tag: s.id, rssi: s.rssi };
    const alt = s.alt?.filter((a) => BLE_BEACON_ID.test(a));
    if (alt?.length) sample.alt = alt;
    if (s.key) sample.key = s.key;
    if (s.info) sample.info = s.info as BeaconInfo;
    samples.push(sample);
  }
  const discovery = samples;
  const beacons = samples.filter((s) => s.info?.kind !== 'other');
  for (const s of subscribers)
    s.onSamples(s.discover ? discovery : beacons, e.dropped ?? 0);
}

/** Starts, restarts or stops the one native stream so it serves every subscriber. */
function reconcile(): Promise<void> {
  chain = chain.then(async () => {
    if (!ble) return;
    if (!subscribers.size) {
      if (running) {
        running = null;
        listener?.remove();
        listener = null;
        ble.stopStream();
      }
      return;
    }
    const discover = [...subscribers].some((s) => s.discover);
    const uuids = wantedUuids();
    const key = uuids.join(',');
    const rich = typeof ble.startStreamWith === 'function';
    if (
      running &&
      running.discover === discover &&
      (running.uuids === key || !rich)
    )
      return;
    const token = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    listener ??= ble.addListener('onSamples', deliver);
    running = { token, discover, uuids: key };
    lastFailure = null;
    try {
      if (rich) await ble.startStreamWith!(token, discover, uuids);
      else await ble.startStream(token);
    } catch (e) {
      running = null;
      lastFailure = e instanceof Error ? e.message : String(e);
      throw e;
    }
  });
  const result = chain;
  // Keep the queue alive after a failure; the caller sees the error through `result`.
  chain = chain.catch(() => undefined);
  return result;
}

/**
 * Continuous foreground beacon stream (batched natively every 500 ms), shared by everyone who
 * listens: live tracking, "locate me" and the beacon setup screen run on one native scan.
 * `discover` also reports non-beacon devices (setup screen). The returned function unsubscribes.
 * Timestamps are seconds on the native stream clock.
 */
export async function startBeaconStream(
  onSamples: (samples: StreamSample[], dropped: number) => void,
  onFailure: (message: string) => void,
  options: { discover?: boolean; onNotice?: (notices: string[]) => void } = {},
): Promise<() => void> {
  if (!ble)
    throw new Error(
      'Install the latest TURN development build to scan beacons.',
    );
  const denied = await requestBlePermissions('scan');
  if (denied) throw new Error(denied);
  const subscriber: Subscriber = {
    onSamples,
    onFailure,
    onNotice: options.onNotice,
    discover: Boolean(options.discover),
  };
  subscribers.add(subscriber);
  watchAppState();
  try {
    await reconcile();
  } catch (e) {
    subscribers.delete(subscriber);
    void reconcile().catch(() => undefined);
    throw e;
  }
  if (lastFailure && !running) {
    subscribers.delete(subscriber);
    throw new Error(lastFailure);
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    subscribers.delete(subscriber);
    if (subscribers.size === 0) {
      // The last listener left: stop right away, also after a failed stream.
      running = null;
      listener?.remove();
      listener = null;
      ble.stopStream();
    } else void reconcile().catch(() => undefined);
  };
}

/** Whether the installed build reads iBeacon and discovery frames (Android build 7, iOS IPA 3). */
export const bleRichStream =
  typeof (native as { startStreamWith?: unknown } | null)?.startStreamWith ===
  'function';

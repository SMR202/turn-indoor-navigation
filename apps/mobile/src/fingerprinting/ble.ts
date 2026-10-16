import { PermissionsAndroid, Platform } from 'react-native';
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
  samples: { t: number; id: string; rssi: number }[];
  dropped: number;
  failure?: string;
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

export type StreamSample = { t: number; tag: string; rssi: number };
/**
 * Continuous foreground TURN-beacon stream (batched natively every 500 ms). The returned function
 * stops it. Timestamps are seconds on the native stream clock, starting near zero.
 */
export async function startBeaconStream(
  onSamples: (samples: StreamSample[], dropped: number) => void,
  onFailure: (message: string) => void,
): Promise<() => void> {
  if (!ble)
    throw new Error(
      'Install the latest TURN development build to scan beacons.',
    );
  const denied = await requestBlePermissions('scan');
  if (denied) throw new Error(denied);
  const token = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const subscription = ble.addListener('onSamples', (e) => {
    if (e.token !== token) return;
    if (e.failure) {
      onFailure(e.failure);
      return;
    }
    onSamples(
      e.samples
        .filter(
          (s) =>
            BLE_BEACON_ID.test(s.id) &&
            Number.isFinite(s.t) &&
            Number.isFinite(s.rssi),
        )
        .map((s) => ({ t: s.t, tag: s.id, rssi: s.rssi })),
      e.dropped ?? 0,
    );
  });
  try {
    await ble.startStream(token);
  } catch (e) {
    subscription.remove();
    throw e;
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    subscription.remove();
    ble.stopStream();
  };
}

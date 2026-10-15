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
  advertisingState(): { advertising: boolean; tag: string | null };
};

const native = requireOptionalNativeModule<Native>('TurnBle');
// Feature-detect by method: other mocked/optional modules must not be mistaken for BLE support.
const ble =
  Platform.OS === 'android' &&
  native &&
  typeof native.startAdvertising === 'function' &&
  typeof native.capabilities === 'function'
    ? native
    : null;
export const bleBuildAvailable = Boolean(ble);

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
  if (Platform.OS !== 'android') return 'BLE beacons need the Android build';
  if (!ble) return 'Install Android build 4 to use BLE beacons';
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
  if (!ble) return failure('Install Android build 4 to scan beacons');
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
  if (!ble) throw new Error('Install Android build 4 to act as a beacon.');
  if (!BLE_BEACON_ID.test(tag))
    throw new Error('Beacon names use 1–12 letters or digits.');
  const denied = await requestBlePermissions('advertise');
  if (denied) throw new Error(denied);
  return ble.startAdvertising(tag, power);
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

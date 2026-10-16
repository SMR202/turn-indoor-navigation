import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  platform: { OS: 'android', Version: 34 },
  request: vi.fn(),
  native: {
    revision: 'turn-ble-1',
    capabilities: vi.fn(),
    scan: vi.fn(),
    cancelScan: vi.fn(),
    startAdvertising: vi.fn(),
    stopAdvertising: vi.fn(),
    advertisingState: vi.fn(),
  },
}));
vi.mock('react-native', () => ({
  Platform: mocks.platform,
  PermissionsAndroid: {
    PERMISSIONS: {
      ACCESS_FINE_LOCATION: 'fine',
      BLUETOOTH_SCAN: 'scan',
      BLUETOOTH_ADVERTISE: 'advertise',
      BLUETOOTH_CONNECT: 'connect',
    },
    requestMultiple: mocks.request,
  },
}));
vi.mock('expo', () => ({ requireOptionalNativeModule: () => mocks.native }));
import { scanBeacons, startBeacon, requestBlePermissions } from './ble';

const granted = {
  fine: 'granted',
  scan: 'granted',
  advertise: 'granted',
  connect: 'granted',
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.platform.Version = 34;
  mocks.platform.OS = 'android';
  mocks.request.mockResolvedValue(granted);
});

it('requests only the scan permissions on Android 12+ and reports a denial', async () => {
  await expect(requestBlePermissions('scan')).resolves.toBeNull();
  expect(mocks.request).toHaveBeenCalledWith(['fine', 'scan', 'connect']);
  mocks.request.mockResolvedValue({ ...granted, scan: 'denied' });
  await expect(requestBlePermissions('scan')).resolves.toContain('Nearby');
  mocks.platform.Version = 30;
  mocks.request.mockResolvedValue(granted);
  await requestBlePermissions('advertise');
  expect(mocks.request).toHaveBeenLastCalledWith(['fine']);
});
it('returns completed readings, dropping malformed beacon tags', async () => {
  mocks.native.scan.mockResolvedValue({
    status: 'Fresh BLE scan',
    completed: true,
    readings: [
      { id: 'B1', samples: [{ t: 0.1, rssi: -60 }] },
      { id: 'bad id', samples: [{ t: 0.1, rssi: -60 }] },
    ],
  });
  const result = await scanBeacons(8000);
  expect(result.completed).toBe(true);
  expect(result.readings.map((b) => b.id)).toEqual(['B1']);
});
it('never turns denial, cancellation or native failure into a silent empty scan', async () => {
  mocks.request.mockResolvedValue({ ...granted, scan: 'denied' });
  expect((await scanBeacons(8000)).completed).toBe(false);
  expect(mocks.native.scan).not.toHaveBeenCalled();
  mocks.request.mockResolvedValue(granted);
  mocks.native.scan.mockRejectedValue(
    new Error('Turn on Bluetooth, then retry.'),
  );
  const failed = await scanBeacons(8000);
  expect(failed).toMatchObject({ completed: false, readings: [] });
  expect(failed.status).toContain('Bluetooth');
  const abort = new AbortController();
  abort.abort();
  expect((await scanBeacons(8000, abort.signal)).completed).toBe(false);
});
it('validates the beacon name before touching Bluetooth', async () => {
  await expect(startBeacon('bad name', 'high')).rejects.toThrow(
    'letters or digits',
  );
  expect(mocks.native.startAdvertising).not.toHaveBeenCalled();
  mocks.native.startAdvertising.mockResolvedValue({
    advertising: true,
    tag: 'B2',
  });
  await expect(startBeacon('B2', 'low')).resolves.toMatchObject({ tag: 'B2' });
  expect(mocks.native.startAdvertising).toHaveBeenCalledWith('B2', 'low');
});

it('scans on iOS without Android permission APIs and refuses to advertise', async () => {
  mocks.platform.OS = 'ios';
  mocks.native.scan.mockResolvedValue({
    status: 'Fresh BLE scan',
    completed: true,
    readings: [{ id: 'B1', samples: [{ t: 0.2, rssi: -58 }] }],
  });
  const result = await scanBeacons(8000);
  expect(result.completed).toBe(true);
  expect(mocks.request).not.toHaveBeenCalled();
  await expect(startBeacon('B1', 'high')).rejects.toThrow(
    'cannot act as a beacon',
  );
  expect(mocks.native.startAdvertising).not.toHaveBeenCalled();
  mocks.platform.OS = 'android';
});

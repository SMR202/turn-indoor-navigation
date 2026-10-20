import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  platform: { OS: 'android', Version: 34 },
  request: vi.fn(),
  appState: { listener: null as null | ((s: string) => void) },
  native: {
    revision: 'turn-ble-1',
    capabilities: vi.fn(),
    scan: vi.fn(),
    cancelScan: vi.fn(),
    startAdvertising: vi.fn(),
    stopAdvertising: vi.fn(),
    advertisingState: vi.fn(),
    stopStream: vi.fn(),
    startStream: vi.fn(),
    addListener: vi.fn(),
  },
}));
vi.mock('react-native', () => ({
  Platform: mocks.platform,
  AppState: {
    addEventListener: (_e: string, fn: (s: string) => void) => {
      mocks.appState.listener = fn;
      return { remove() {} };
    },
  },
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

it('streams only valid TURN samples for its own token and stops cleanly', async () => {
  const remove = vi.fn();
  let listener: (e: unknown) => void = () => {};
  mocks.native.addListener.mockImplementation(
    (_event: string, fn: (e: unknown) => void) => {
      listener = fn;
      return { remove };
    },
  );
  mocks.native.startStream.mockResolvedValue({ token: 'x' });
  const batches: unknown[] = [];
  const failures: string[] = [];
  const { startBeaconStream } = await import('./ble');
  const stop = await startBeaconStream(
    (s) => batches.push(s),
    (m) => failures.push(m),
  );
  const token = (mocks.native.startStream as ReturnType<typeof vi.fn>).mock
    .calls[0]![0];
  listener({
    token: 'other',
    samples: [{ t: 1, id: 'B1', rssi: -50 }],
    dropped: 0,
  });
  listener({
    token,
    samples: [
      { t: 1, id: 'B1', rssi: -50 },
      { t: 1, id: 'bad id', rssi: -50 },
      { t: Number.NaN, id: 'B2', rssi: -50 },
    ],
    dropped: 0,
  });
  listener({
    token,
    samples: [],
    dropped: 0,
    failure: 'Turn on Bluetooth, then retry.',
  });
  expect(batches).toEqual([[{ t: 1, tag: 'B1', rssi: -50 }]]);
  expect(failures).toEqual(['Turn on Bluetooth, then retry.']);
  stop();
  stop();
  expect(remove).toHaveBeenCalledOnce();
  expect(mocks.native.stopStream).toHaveBeenCalledOnce();
});

it('shares one native stream between listeners and serves discovery to setup screens only', async () => {
  let listener: (e: unknown) => void = () => {};
  mocks.native.addListener.mockImplementation(
    (_event: string, fn: (e: unknown) => void) => {
      listener = fn;
      return { remove: vi.fn() };
    },
  );
  const rich = vi.fn().mockResolvedValue({ token: 'x' });
  (mocks.native as Record<string, unknown>).startStreamWith = rich;
  const { startBeaconStream, DEFAULT_IBEACON_UUIDS } = await import('./ble');
  const live: unknown[][] = [];
  const setup: unknown[][] = [];
  const stopLive = await startBeaconStream(
    (b) => live.push(b),
    () => {},
  );
  expect(rich).toHaveBeenCalledTimes(1);
  expect(rich.mock.calls[0]![1]).toBe(false);
  expect(rich.mock.calls[0]![2]).toEqual(
    expect.arrayContaining(DEFAULT_IBEACON_UUIDS),
  );
  const stopSetup = await startBeaconStream(
    (b) => setup.push(b),
    () => {},
    {
      discover: true,
    },
  );
  // Discovery restarts the one native scan; the live listener keeps receiving.
  expect(rich).toHaveBeenCalledTimes(2);
  expect(rich.mock.calls[1]![1]).toBe(true);
  const token = rich.mock.calls[1]![0];
  listener({
    token,
    dropped: 0,
    samples: [
      {
        t: 1,
        id: 'IB0001000A',
        rssi: -60,
        alt: ['MCAABBCCDD'],
        key: 'k1',
        info: { kind: 'ibeacon', major: 1, minor: 10 },
      },
      {
        t: 1,
        id: 'NMphone',
        rssi: -70,
        key: 'k2',
        info: { kind: 'other', name: 'phone' },
      },
    ],
  });
  expect(live).toEqual([
    [expect.objectContaining({ tag: 'IB0001000A', alt: ['MCAABBCCDD'] })],
  ]);
  expect(setup[0]).toHaveLength(2);
  stopSetup();
  await new Promise((r) => setTimeout(r, 0));
  expect(rich).toHaveBeenCalledTimes(3); // back to beacon frames only
  expect(rich.mock.calls[2]![1]).toBe(false);
  // After the app returns from the background, the stream starts again.
  mocks.appState.listener?.('background');
  mocks.appState.listener?.('active');
  await new Promise((r) => setTimeout(r, 0));
  expect(rich).toHaveBeenCalledTimes(4);
  stopLive();
  expect(mocks.native.stopStream).toHaveBeenCalled();
  delete (mocks.native as Record<string, unknown>).startStreamWith;
});

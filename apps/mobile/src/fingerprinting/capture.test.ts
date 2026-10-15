import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  platform: { OS: 'android' },
  app: { currentState: 'active', addEventListener: vi.fn() },
  magnetic: {
    isAvailableAsync: vi.fn(),
    requestPermissionsAsync: vi.fn(),
    setUpdateInterval: vi.fn(),
    addListener: vi.fn(),
  },
  permissions: vi.fn(),
  scan: vi.fn(),
  cancel: vi.fn(),
  remove: vi.fn(),
  removeApp: vi.fn(),
}));
vi.mock('react-native', () => ({
  Platform: mocks.platform,
  AppState: mocks.app,
  PermissionsAndroid: {
    PERMISSIONS: {
      ACCESS_FINE_LOCATION: 'fine',
      ACCESS_COARSE_LOCATION: 'coarse',
    },
    requestMultiple: mocks.permissions,
  },
}));
vi.mock('expo-sensors', () => ({ Magnetometer: mocks.magnetic }));
vi.mock('expo', () => ({
  requireOptionalNativeModule: () => ({
    scan: mocks.scan,
    cancel: mocks.cancel,
  }),
}));
import { captureFingerprint } from './capture';

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.platform.OS = 'android';
  mocks.app.currentState = 'active';
  mocks.app.addEventListener.mockReturnValue({ remove: mocks.removeApp });
  mocks.magnetic.isAvailableAsync.mockResolvedValue(true);
  mocks.magnetic.requestPermissionsAsync.mockResolvedValue({ granted: true });
  mocks.magnetic.addListener.mockReturnValue({ remove: mocks.remove });
  mocks.permissions.mockResolvedValue({ fine: 'granted', coarse: 'granted' });
  mocks.scan.mockResolvedValue({ status: 'throttled', readings: [] });
});
afterEach(() => vi.useRealTimers());
async function feed() {
  await vi.advanceTimersByTimeAsync(0);
  const listener = mocks.magnetic.addListener.mock.calls[0]![0];
  for (let i = 0; i < 80; i++)
    listener({ x: 30, y: 40, z: 0, timestamp: 100 + i / 10 });
}
it('cancels a pending native Wi-Fi scan after magnetic capture finishes', async () => {
  let finishRadio: (value: unknown) => void = () => {};
  mocks.scan.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishRadio = resolve;
      }),
  );
  mocks.cancel.mockImplementation(() =>
    finishRadio({ status: 'cancelled', readings: [] }),
  );
  const abort = new AbortController();
  const result = captureFingerprint('phone-test', true, abort.signal, vi.fn());
  const assertion = expect(result).rejects.toThrow('interrupted');
  await feed();
  await vi.advanceTimersByTimeAsync(8000);
  abort.abort();
  await assertion;
  expect(mocks.cancel).toHaveBeenCalled();
});
it('keeps magnetic collection working when optional Wi-Fi permission is denied', async () => {
  mocks.permissions.mockResolvedValue({ fine: 'denied', coarse: 'granted' });
  const result = captureFingerprint(
    'phone-test',
    true,
    new AbortController().signal,
    vi.fn(),
  );
  await feed();
  await vi.advanceTimersByTimeAsync(8000);
  const capture = await result;
  expect(capture.magnetic).toHaveLength(80);
  expect(capture.magnetic[0]!.t).toBe(0);
  expect(capture.wifiStatus).toContain('denied');
  expect(mocks.scan).not.toHaveBeenCalled();
  expect(mocks.remove).toHaveBeenCalledOnce();
  expect(mocks.removeApp).toHaveBeenCalledOnce();
});
it('cleans subscriptions and does not return a partial capture after backgrounding', async () => {
  const result = captureFingerprint(
    'phone-test',
    false,
    new AbortController().signal,
    vi.fn(),
  );
  const assertion = expect(result).rejects.toThrow('interrupted');
  await feed();
  mocks.app.addEventListener.mock.calls[0]![1]('background');
  await assertion;
  expect(mocks.remove).toHaveBeenCalledOnce();
  expect(mocks.cancel).toHaveBeenCalled();
});
it('does not invoke Android permission APIs on iOS and preserves unavailable-sensor failures', async () => {
  mocks.platform.OS = 'ios';
  const result = captureFingerprint(
    'phone-test',
    false,
    new AbortController().signal,
    vi.fn(),
  );
  await feed();
  await vi.advanceTimersByTimeAsync(8000);
  await result;
  expect(mocks.permissions).not.toHaveBeenCalled();
  expect(mocks.magnetic.requestPermissionsAsync).toHaveBeenCalledOnce();
  mocks.magnetic.isAvailableAsync.mockResolvedValue(false);
  await expect(
    captureFingerprint(
      'phone-test',
      false,
      new AbortController().signal,
      vi.fn(),
    ),
  ).rejects.toThrow('magnetometer');
});
it('deduplicates repeated native timestamps instead of fabricating samples', async () => {
  const result = captureFingerprint(
    'phone-test',
    false,
    new AbortController().signal,
    vi.fn(),
  );
  const assertion = expect(result).rejects.toThrow('Not enough');
  await vi.advanceTimersByTimeAsync(0);
  const listener = mocks.magnetic.addListener.mock.calls[0]![0];
  for (let i = 0; i < 100; i++) listener({ x: 50, y: 0, z: 0, timestamp: 100 });
  await vi.advanceTimersByTimeAsync(8000);
  await assertion;
});
it('records an unavailable BLE scan without fabricating an empty beacon list', async () => {
  const result = captureFingerprint(
    'phone-test',
    false,
    new AbortController().signal,
    vi.fn(),
    true,
  );
  await feed();
  await vi.advanceTimersByTimeAsync(8000);
  const capture = await result;
  expect(capture.ble).toBeUndefined();
  expect(capture.bleStatus).toBeTruthy();
});

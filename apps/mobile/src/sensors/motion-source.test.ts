import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DeviceMotionMeasurement } from 'expo-sensors';
const mocks = vi.hoisted(() => ({
  platform: { OS: 'android' },
  motion: {
    requestPermissionsAsync: vi.fn(),
    isAvailableAsync: vi.fn(),
    setUpdateInterval: vi.fn(),
    addListener: vi.fn(),
  },
}));
vi.mock('react-native', () => ({ Platform: mocks.platform }));
vi.mock('expo-sensors', () => ({ DeviceMotion: mocks.motion }));
import { startMotionSource } from './motion-source';
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  mocks.platform.OS = 'android';
  mocks.motion.requestPermissionsAsync.mockResolvedValue({ granted: false });
  mocks.motion.isAvailableAsync.mockResolvedValue(true);
  mocks.motion.addListener.mockReturnValue({ remove: vi.fn() });
});
afterEach(() => vi.useRealTimers());
it('starts Android raw motion and delivers samples even when activity permission would be denied', async () => {
  const consume = vi.fn(),
    failed = vi.fn(),
    foreground = vi.fn(async () => {});
  const cleanup = await startMotionSource('test', consume, failed, foreground);
  expect(mocks.motion.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(foreground).toHaveBeenCalledOnce();
  const sample: DeviceMotionMeasurement = {
    accelerationIncludingGravity: { x: 0, y: 0, z: -9.81, timestamp: 10 },
    acceleration: { x: 0, y: 0, z: 0, timestamp: 10 },
    rotation: { alpha: 0, beta: 0, gamma: 0, timestamp: 10 },
    rotationRate: { alpha: 0, beta: 0, gamma: 0, timestamp: 10 },
    orientation: 0,
    interval: 20,
  };
  mocks.motion.addListener.mock.calls[0]![0](sample);
  expect(consume.mock.calls.map(([o]) => o.type)).toContain('accelerometer');
  expect(failed).not.toHaveBeenCalled();
  cleanup();
  expect(
    mocks.motion.addListener.mock.results[0]!.value.remove,
  ).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it('still enforces iOS motion consent', async () => {
  mocks.platform.OS = 'ios';
  await expect(
    startMotionSource('test', vi.fn(), vi.fn(), async () => {}),
  ).rejects.toThrow('Motion & Fitness');
  expect(mocks.motion.addListener).not.toHaveBeenCalled();
  mocks.motion.requestPermissionsAsync.mockResolvedValue({ granted: true });
  const cleanup = await startMotionSource(
    'test',
    vi.fn(),
    vi.fn(),
    async () => {},
  );
  expect(mocks.motion.addListener).toHaveBeenCalledOnce();
  cleanup();
});
it('reports unavailable hardware and missing Android samples instead of misreporting permission denial', async () => {
  mocks.motion.isAvailableAsync.mockResolvedValue(false);
  await expect(
    startMotionSource('test', vi.fn(), vi.fn(), async () => {}),
  ).rejects.toThrow('unavailable');
  expect(mocks.motion.addListener).not.toHaveBeenCalled();
  mocks.motion.isAvailableAsync.mockResolvedValue(true);
  const failed = vi.fn();
  const cleanup = await startMotionSource(
    'test',
    vi.fn(),
    failed,
    async () => {},
  );
  await vi.advanceTimersByTimeAsync(5500);
  expect(failed).toHaveBeenCalledWith(
    expect.stringContaining('did not initialise'),
  );
  cleanup();
});

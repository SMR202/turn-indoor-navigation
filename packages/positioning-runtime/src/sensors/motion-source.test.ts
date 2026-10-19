import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { MotionBatch, RawMotionEvent } from '../turn-motion';
const mocks = vi.hoisted(() => ({
  platform: { OS: 'android' },
  native: {
    revision: 'turn-android-imu-1',
    start: vi.fn(),
    stop: vi.fn(),
    acknowledge: vi.fn(),
    addListener: vi.fn(),
  },
  motion: {
    requestPermissionsAsync: vi.fn(),
    isAvailableAsync: vi.fn(),
    setUpdateInterval: vi.fn(),
    addListener: vi.fn(),
  },
}));
vi.mock('react-native', () => ({ Platform: mocks.platform }));
vi.mock('expo-sensors', () => ({ DeviceMotion: mocks.motion }));
vi.mock('../turn-motion', () => ({ default: mocks.native }));
import { startMotionSource } from './motion-source';

function samples(timestamp: number): RawMotionEvent[] {
  return [
    { type: 9, timestamp, values: [0, 0, 9.81] },
    { type: 11, timestamp, values: [0, 0, 0] },
    { type: 1, timestamp, values: [0, 0, 9.81] },
    { type: 4, timestamp, values: [0, 0, 0] },
    { type: 10, timestamp, values: [0, 0, 0] },
  ];
}
function deliver(batch: MotionBatch) {
  mocks.native.addListener.mock.calls.find(
    ([event]) => event === 'onBatch',
  )![1](batch);
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  mocks.platform.OS = 'android';
  mocks.native.revision = 'turn-android-imu-1';
  mocks.motion.requestPermissionsAsync.mockResolvedValue({ granted: false });
  mocks.motion.isAvailableAsync.mockResolvedValue(true);
  mocks.native.start.mockResolvedValue(undefined);
  mocks.native.addListener.mockImplementation(() => ({ remove: vi.fn() }));
  mocks.motion.addListener.mockReturnValue({ remove: vi.fn() });
});
afterEach(() => vi.useRealTimers());

it('uses the native Android stream without activity permission or display-frame snapshots', async () => {
  const consume = vi.fn(),
    failed = vi.fn(),
    foreground = vi.fn(async () => {});
  const cleanup = await startMotionSource('test', consume, failed, foreground);
  expect(mocks.motion.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(mocks.motion.addListener).not.toHaveBeenCalled();
  expect(foreground).toHaveBeenCalledOnce();
  deliver({ token: 'test', sequence: 1, samples: samples(10) });
  expect(consume.mock.calls.map(([o]) => o.type)).toContain('accelerometer');
  expect(mocks.native.acknowledge).toHaveBeenCalledWith('test', 1);
  expect(failed).not.toHaveBeenCalled();
  cleanup();
  expect(mocks.native.stop).toHaveBeenCalledWith('test');
  for (const result of mocks.native.addListener.mock.results)
    expect(result.value.remove).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  const count = consume.mock.calls.length;
  deliver({ token: 'test', sequence: 2, samples: samples(11) });
  expect(consume).toHaveBeenCalledTimes(count);
});
it('still enforces iOS motion consent and uses the existing iOS source', async () => {
  mocks.platform.OS = 'ios';
  await expect(
    startMotionSource('test', vi.fn(), vi.fn(), async () => {}),
  ).rejects.toThrow('Motion & Fitness');
  mocks.motion.requestPermissionsAsync.mockResolvedValue({ granted: true });
  const cleanup = await startMotionSource(
    'test',
    vi.fn(),
    vi.fn(),
    async () => {},
  );
  expect(mocks.motion.addListener).toHaveBeenCalledOnce();
  expect(mocks.native.start).not.toHaveBeenCalled();
  cleanup();
});
it('preserves healthy 50 Hz readings delivered in 200 ms batches without watchdog failures', async () => {
  const consume = vi.fn(),
    failed = vi.fn();
  const cleanup = await startMotionSource(
    'test',
    consume,
    failed,
    async () => {},
  );
  for (let batch = 0; batch < 30; batch++) {
    await vi.advanceTimersByTimeAsync(200);
    deliver({
      token: 'test',
      sequence: batch + 1,
      samples: Array.from({ length: 10 }, (_, i) =>
        samples(10 + (batch * 10 + i) / 50),
      ).flat(),
    });
  }
  expect(failed).not.toHaveBeenCalled();
  expect(
    consume.mock.calls.filter(([o]) => o.type === 'accelerometer'),
  ).toHaveLength(300);
  cleanup();
});
it('reports genuinely slow Android data only once and does not suggest reinstalling the active native capture', async () => {
  const failed = vi.fn();
  const cleanup = await startMotionSource(
    'slow',
    vi.fn(),
    failed,
    async () => {},
  );
  for (let i = 0; i < 30; i++) {
    deliver({ token: 'slow', sequence: i + 1, samples: samples(10 + i / 5) });
    await vi.advanceTimersByTimeAsync(200);
  }
  expect(failed).toHaveBeenCalledOnce();
  expect(failed.mock.calls[0]![0]).toContain('Sensor data too slow');
  expect(failed.mock.calls[0]![0]).not.toContain('install');
  cleanup();
});
it('reports missing hardware, missing build and absence of samples distinctly, cleaning failed starts', async () => {
  mocks.native.start.mockRejectedValueOnce(
    new Error('Required Android sensor unavailable: 9'),
  );
  await expect(
    startMotionSource('test', vi.fn(), vi.fn(), async () => {}),
  ).rejects.toThrow('unavailable');
  expect(mocks.native.stop).toHaveBeenCalledWith('test');
  expect(vi.getTimerCount()).toBe(0);
  mocks.native.revision = 'old';
  await expect(
    startMotionSource('test', vi.fn(), vi.fn(), async () => {}),
  ).rejects.toThrow('updated TURN sensor build');
  mocks.native.revision = 'turn-android-imu-1';
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
it('ignores other sessions, rejects missing batches and propagates native failures once', async () => {
  const consume = vi.fn(),
    failed = vi.fn();
  const cleanup = await startMotionSource(
    'test',
    consume,
    failed,
    async () => {},
  );
  deliver({ token: 'old', sequence: 20, samples: samples(10) });
  expect(consume).not.toHaveBeenCalled();
  deliver({ token: 'test', sequence: 2, samples: samples(10) });
  expect(failed).toHaveBeenCalledWith(expect.stringContaining('batch missing'));
  mocks.native.addListener.mock.calls.find(
    ([event]) => event === 'onFailure',
  )![1]({ token: 'test', message: 'buffer filled' });
  expect(failed).toHaveBeenCalledOnce();
  cleanup();
});

import { expect, it, vi } from 'vitest';
import { preparePedometer, type NativeCount } from './pedometer-capture';

function fixture() {
  let callback: (value: { steps: number }) => void = () => {};
  const remove = vi.fn();
  const port = {
    requestPermissionsAsync: vi.fn(async () => ({ granted: true })),
    isAvailableAsync: vi.fn(async () => true),
    watchStepCount: vi.fn((cb: typeof callback) => {
      callback = cb;
      return { remove };
    }),
    getStepCountAsync: vi.fn(async () => ({ steps: 10 })),
  };
  return { port, remove, emit: (steps: number) => callback({ steps }) };
}
it('keeps unknown live count distinct from zero and queries the fixed interval after stop', async () => {
  const f = fixture();
  let time = 1000;
  let result: NativeCount | undefined;
  const capture = await preparePedometer(
    f.port,
    'ios',
    (s) => {
      result = s;
    },
    () => time,
    () => time,
  );
  expect(result!.liveSteps).toBeNull();
  expect(f.port.watchStepCount).not.toHaveBeenCalled();
  capture.begin(0);
  capture.begin(0);
  expect(f.port.watchStepCount).toHaveBeenCalledTimes(1);
  time = 4000;
  f.emit(8);
  expect(result!.updates).toEqual([{ receivedAfterStartSeconds: 3, steps: 8 }]);
  time = 6000;
  await capture.finish();
  f.emit(99);
  expect(result!.liveSteps).toBe(8);
  expect(result!.queriedSteps).toBe(10);
  expect(f.port.getStepCountAsync).toHaveBeenCalledWith(
    new Date(1000),
    new Date(6000),
  );
  expect(f.remove).toHaveBeenCalledTimes(1);
});
it('keeps denied and unavailable sources out of the comparison', async () => {
  for (const denied of [true, false]) {
    const f = fixture();
    let result: NativeCount | undefined;
    f.port.requestPermissionsAsync.mockResolvedValue({ granted: !denied });
    f.port.isAvailableAsync.mockResolvedValue(false);
    const capture = await preparePedometer(f.port, 'ios', (s) => {
      result = s;
    });
    capture.begin(0);
    await capture.finish();
    expect(result!.status).toBe(denied ? 'denied' : 'unavailable');
    expect(result!.liveSteps).toBeNull();
    expect(f.port.watchStepCount).not.toHaveBeenCalled();
  }
});
it('records Android as partial live evidence and rejects resets', async () => {
  const f = fixture();
  let result: NativeCount | undefined;
  const capture = await preparePedometer(f.port, 'android', (s) => {
    result = s;
  });
  capture.begin(0);
  f.emit(4);
  await capture.finish();
  expect(result!.status).toBe('stopped');
  expect(f.port.getStepCountAsync).not.toHaveBeenCalled();
  const g = fixture();
  const other = await preparePedometer(g.port, 'ios', (s) => {
    result = s;
  });
  other.begin(0);
  g.emit(4);
  g.emit(2);
  await other.finish();
  expect(result!.status).toBe('error');
  expect(g.port.getStepCountAsync).not.toHaveBeenCalled();
});
it('bounds a stalled interval query and preserves the live estimate', async () => {
  vi.useFakeTimers();
  try {
    const f = fixture();
    let result: NativeCount | undefined;
    f.port.getStepCountAsync.mockImplementation(() => new Promise(() => {}));
    const capture = await preparePedometer(f.port, 'ios', (s) => {
      result = s;
    });
    capture.begin(0);
    f.emit(5);
    const finished = capture.finish();
    await vi.advanceTimersByTimeAsync(8000);
    await finished;
    expect(result!.status).toBe('stopped');
    expect(result!.queriedSteps).toBeNull();
    expect(result!.liveSteps).toBe(5);
  } finally {
    vi.useRealTimers();
  }
});

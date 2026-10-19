import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  platform: { OS: 'android', Version: 34 },
  consume: null as null | ((e: unknown) => void),
  sessionId: '',
  stopped: 0,
}));
vi.mock('react-native', () => ({
  Platform: mocks.platform,
  AppState: {
    currentState: 'active',
    addEventListener: () => ({ remove() {} }),
  },
  PermissionsAndroid: { PERMISSIONS: {}, requestMultiple: vi.fn() },
}));
vi.mock('expo', () => ({ requireOptionalNativeModule: () => null }));
vi.mock('./sensors/motion-source', () => ({
  startMotionSource: async (
    id: string,
    consume: (e: unknown) => void,
    _failed: unknown,
    before: () => Promise<void>,
  ) => {
    await before();
    mocks.consume = consume;
    mocks.sessionId = id;
    return () => {
      mocks.stopped++;
    };
  },
}));
import { demoCentre } from '@turn/venue-model';
import { LivePositioning, liveAvailability, type LiveState } from './live';

it('reports why live position is unavailable', () => {
  expect(liveAvailability(demoCentre, 'ground').available).toBe(true);
  expect(
    liveAvailability({ ...demoCentre, anchors: [] }, 'ground').reason,
  ).toMatch(/entry marker/);
  mocks.platform.OS = 'web';
  expect(liveAvailability(demoCentre, 'ground').reason).toMatch(/phone/);
  mocks.platform.OS = 'android';
});

it('starts at the given point, waits for the sensors to settle and stops cleanly', async () => {
  const live = new LivePositioning({
    venue: demoCentre,
    floorId: 'ground',
    beacons: [],
  });
  const states: LiveState[] = [];
  live.subscribe((s) => states.push(s));
  await live.start({ x: 3, y: 18 }, 0);
  const s = live.snapshot();
  expect(s.fix).not.toBeNull();
  expect(Math.hypot(s.fix!.x - 3, s.fix!.y - 18)).toBeLessThan(1.5);
  expect(s.fix!.sigma).toBeGreaterThanOrEqual(1);
  expect(mocks.consume).toBeTypeOf('function');
  // An early motion sample keeps the controller settling (hold still, face the route).
  mocks.consume!({
    schemaVersion: 1,
    sessionId: mocks.sessionId,
    source: 'test',
    timestampSeconds: 0.5,
    type: 'attitude',
    yawRad: 0,
    tiltRad: 0.1,
    units: 'rad',
    frame: 'session-relative',
  });
  expect(['starting', 'settling']).toContain(live.snapshot().phase);
  live.stop();
  expect(mocks.stopped).toBe(1);
  expect(live.snapshot().phase).toBe('idle');
  expect(states.length).toBeGreaterThan(2);
});

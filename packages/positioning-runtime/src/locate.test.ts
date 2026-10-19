import { expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 34 },
  PermissionsAndroid: { PERMISSIONS: {}, requestMultiple: vi.fn() },
}));
vi.mock('expo', () => ({ requireOptionalNativeModule: () => null }));
import { predictRssi } from '@turn/positioning-core';
import { demoCentre } from '@turn/venue-model';
import { locateFromSamples, locateWithBeacons } from './locate';

const beacons = [
  { tag: 'B1', floorId: 'ground', x: 11, y: 25, referenceRssi: -59 },
  { tag: 'B2', floorId: 'ground', x: 30, y: 10, referenceRssi: -59 },
  { tag: 'B3', floorId: 'ground', x: 50, y: 25, referenceRssi: -59 },
  { tag: 'B4', floorId: 'level-1', x: 14, y: 25, referenceRssi: -59 },
];

it('places a still visitor near the beacons they hear, on the right floor', () => {
  const at = { x: 28, y: 18 };
  const samples = [];
  for (let t = 0; t < 6; t += 0.2)
    for (const b of beacons.slice(0, 3))
      samples.push({
        at: t,
        tag: b.tag,
        rssi: predictRssi(
          { refRssi: -59, exponent: 2.3 },
          Math.hypot(b.x - at.x, b.y - at.y),
        ),
      });
  const r = locateFromSamples(demoCentre, beacons, samples, 6);
  expect(r.fix).not.toBeNull();
  if (!r.fix) return;
  expect(r.fix.floorId).toBe('ground');
  expect(r.heard).toBe(3);
  // Synthetic, noise-free readings: a sanity bound, not an accuracy claim.
  expect(Math.hypot(r.fix.x - at.x, r.fix.y - at.y)).toBeLessThan(8);
});

it('explains why it cannot locate', async () => {
  expect(locateFromSamples(demoCentre, beacons, [], 6)).toEqual({
    fix: null,
    reason: 'No venue beacons heard here.',
  });
  expect(
    locateFromSamples(demoCentre, beacons, [{ at: 1, tag: 'B1', rssi: -70 }], 6)
      .fix,
  ).toBeNull();
  expect((await locateWithBeacons(demoCentre, beacons)).fix).toBeNull(); // no native BLE in tests
});

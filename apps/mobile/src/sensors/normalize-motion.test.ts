import { expect, it } from 'vitest';
import type { DeviceMotionMeasurement } from 'expo-sensors';
import { createMotionNormalizer } from './normalize-motion';

const sample = (timestamp: number): DeviceMotionMeasurement => ({
  acceleration: { x: 0, y: 0, z: 0, timestamp },
  accelerationIncludingGravity: { x: 0, y: 0, z: -9.80665, timestamp },
  rotation: { alpha: 0.3, beta: 0, gamma: 0, timestamp },
  rotationRate: { alpha: 0, beta: 0, gamma: 0, timestamp },
  orientation: 0,
  interval: 20,
});
it('uses native seconds, deduplicates fields and normalizes gravity tilt', () => {
  const normalize = createMotionNormalizer('test');
  const initial = normalize(sample(100));
  expect(initial[0]).toMatchObject({
    type: 'attitude',
    timestampSeconds: 0,
    tiltRad: 0,
  });
  if (initial[0]?.type !== 'attitude') throw new Error('Missing attitude');
  expect(initial[0].yawRad).toBeCloseTo(0.3);
  expect(normalize(sample(100))).toEqual([]);
  expect(normalize(sample(100.02))[1]!.timestampSeconds).toBeCloseTo(0.02);
  expect(() => normalize(sample(99))).toThrow('reversal');
});
it('preserves fresh attitude when Android repeats acceleration', () => {
  const normalize = createMotionNormalizer('test');
  normalize(sample(100));
  const next = sample(100.02);
  next.accelerationIncludingGravity!.timestamp = 100;
  expect(normalize(next)).toHaveLength(1);
});
it('distinguishes screen-down from screen-up instead of silently reversing yaw', () => {
  const next = sample(100);
  next.accelerationIncludingGravity!.z = 9.80665;
  expect(createMotionNormalizer('test')(next)[0]).toMatchObject({
    tiltRad: Math.PI,
  });
});

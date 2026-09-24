import type { DeviceMotionMeasurement } from 'expo-sensors';
import type { Observation } from '@turn/contracts';

/** Native-time adapter: repeated fields are normal on Android; reversals are not. */
export function createMotionNormalizer(sessionId: string) {
  let origin: number | null = null;
  let lastAcceleration = -Infinity,
    lastRotation = -Infinity;
  return (sample: DeviceMotionMeasurement): Observation[] => {
    const acceleration = sample.accelerationIncludingGravity;
    const rotation = sample.rotation;
    if (
      !acceleration ||
      !rotation ||
      ![
        acceleration.timestamp,
        rotation.timestamp,
        acceleration.x,
        acceleration.y,
        acceleration.z,
        rotation.alpha,
      ].every(Number.isFinite)
    )
      throw new Error('Required motion/attitude data unavailable');
    origin ??= Math.min(acceleration.timestamp, rotation.timestamp);
    if (
      acceleration.timestamp < lastAcceleration ||
      rotation.timestamp < lastRotation
    )
      throw new Error('Native timestamp reversal');
    const observations: Observation[] = [];
    const envelope = {
      schemaVersion: 1 as const,
      sessionId,
      source: 'expo-devicemotion-57.0.3',
    };
    if (rotation.timestamp > lastRotation) {
      const a = sample.acceleration;
      const gravity = a
        ? [acceleration.x - a.x, acceleration.y - a.y, acceleration.z - a.z]
        : [acceleration.x, acceleration.y, acceleration.z];
      const magnitude = Math.hypot(...gravity);
      if (magnitude < 3) throw new Error('Gravity estimate unavailable');
      observations.push({
        ...envelope,
        type: 'attitude',
        timestampSeconds: rotation.timestamp - origin,
        yawRad: Math.atan2(Math.sin(rotation.alpha), Math.cos(rotation.alpha)),
        tiltRad: Math.acos(Math.max(-1, Math.min(1, -gravity[2]! / magnitude))),
        units: 'rad',
        frame: 'session-relative',
      });
      lastRotation = rotation.timestamp;
    }
    if (acceleration.timestamp > lastAcceleration) {
      observations.push({
        ...envelope,
        type: 'accelerometer',
        timestampSeconds: acceleration.timestamp - origin,
        values: [acceleration.x, acceleration.y, acceleration.z],
        includesGravity: true,
        units: 'm/s2',
        frame: 'device',
      });
      lastAcceleration = acceleration.timestamp;
    }
    return observations;
  };
}

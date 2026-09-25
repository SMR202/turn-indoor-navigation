import type { DeviceMotionMeasurement } from 'expo-sensors';
import type { Observation } from '@turn/contracts';

/** Native-time adapter: repeated fields are normal on Android; reversals are not. */
export function createMotionNormalizer(
  sessionId: string,
  platform?: 'ios' | 'android',
) {
  let origin: number | null = null;
  let lastAcceleration = -Infinity,
    lastRotation = -Infinity;
  let lastGyro = -Infinity,
    lastLinear = -Infinity;
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
        ...(platform && [rotation.beta, rotation.gamma].every(Number.isFinite)
          ? {
              platformEulerRad: {
                alpha: rotation.alpha,
                beta: rotation.beta,
                gamma: rotation.gamma,
                convention:
                  platform === 'ios'
                    ? ('ios-core-motion' as const)
                    : ('android-expo' as const),
              },
            }
          : {}),
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
    if (platform) {
      const rate = sample.rotationRate,
        linear = sample.acceleration;
      if (
        rate &&
        [rate.alpha, rate.beta, rate.gamma, rate.timestamp].every(
          Number.isFinite,
        ) &&
        rate.timestamp >= origin &&
        rate.timestamp > lastGyro
      ) {
        const axes =
          platform === 'ios'
            ? [rate.gamma, rate.beta, rate.alpha]
            : [rate.alpha, rate.beta, rate.gamma];
        observations.push({
          ...envelope,
          type: 'gyroscope',
          timestampSeconds: rate.timestamp - origin,
          values: axes.map((v) => (v * Math.PI) / 180) as [
            number,
            number,
            number,
          ],
          units: 'rad/s',
          frame: 'device',
        });
        lastGyro = rate.timestamp;
      }
      if (
        linear &&
        [linear.x, linear.y, linear.z, linear.timestamp].every(
          Number.isFinite,
        ) &&
        linear.timestamp >= origin &&
        linear.timestamp > lastLinear
      ) {
        observations.push({
          ...envelope,
          type: 'linear-acceleration',
          timestampSeconds: linear.timestamp - origin,
          values: [linear.x, linear.y, linear.z],
          units: 'm/s2',
          frame: 'device',
        });
        lastLinear = linear.timestamp;
      }
    }
    return observations;
  };
}

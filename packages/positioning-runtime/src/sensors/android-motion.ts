import type { Observation } from '@turn/contracts';
import TurnMotion, { type RawMotionEvent } from '../turn-motion';
import { createMotionNormalizer } from './normalize-motion';

export const ANDROID_MOTION_REVISION = 'turn-android-imu-1';

/** Preserve each native reading through delayed batches; latest fields keep their own times. */
export function createAndroidBatchNormalizer(sessionId: string) {
  const normalize = createMotionNormalizer(
    sessionId,
    'android',
    ANDROID_MOTION_REVISION,
  );
  const latest = new Map<number, RawMotionEvent>();
  let initialized = false;
  return (events: RawMotionEvent[]): Observation[] => {
    const observations: Observation[] = [];
    for (const event of events) {
      if (
        !Number.isFinite(event.timestamp) ||
        event.values.length !== 3 ||
        !event.values.every(Number.isFinite)
      )
        throw new Error('Invalid native motion reading');
      const previous = latest.get(event.type);
      if (previous && event.timestamp < previous.timestamp)
        throw new Error('Native timestamp reversal');
      if (previous && event.timestamp === previous.timestamp) continue;
      latest.set(event.type, event);
      const acceleration = latest.get(1),
        gravity = latest.get(9),
        rotation = latest.get(11);
      if (!acceleration || !gravity || !rotation) continue;
      const linear = latest.get(10),
        gyro = latest.get(4);
      if (!linear || !gyro) continue;
      if (!initialized) {
        const times = [acceleration, gravity, rotation, linear, gyro].map(
          (reading) => reading.timestamp,
        );
        if (Math.max(...times) - Math.min(...times) > 0.06) continue;
        initialized = true;
      }
      if (event.timestamp - gravity.timestamp > 0.5)
        throw new Error(
          'Android gravity sensor stopped updating. Send this recording for diagnosis.',
        );
      const xyz = (reading: RawMotionEvent) => ({
        x: reading.values[0],
        y: reading.values[1],
        z: reading.values[2],
        timestamp: reading.timestamp,
      });
      observations.push(
        ...normalize(
          {
            // Android measures +g face-up. Retain the existing Expo/Core Motion
            // acceleration convention (linear minus gravity) and PDR replay contract.
            accelerationIncludingGravity: {
              x: acceleration.values[0] - 2 * gravity.values[0],
              y: acceleration.values[1] - 2 * gravity.values[1],
              z: acceleration.values[2] - 2 * gravity.values[2],
              timestamp: acceleration.timestamp,
            },
            rotation: {
              alpha: rotation.values[0],
              beta: rotation.values[1],
              gamma: rotation.values[2],
              timestamp: rotation.timestamp,
            },
            acceleration: linear ? xyz(linear) : null,
            rotationRate: gyro
              ? {
                  alpha: (gyro.values[0] * 180) / Math.PI,
                  beta: (gyro.values[1] * 180) / Math.PI,
                  gamma: (gyro.values[2] * 180) / Math.PI,
                  timestamp: gyro.timestamp,
                }
              : null,
          },
          gravity.values.map((value) => -value) as [number, number, number],
        ),
      );
    }
    return observations;
  };
}

export async function startAndroidMotion(
  sessionId: string,
  consume: (observations: Observation[]) => void,
  failed: (message: string) => void,
) {
  if (TurnMotion?.revision !== ANDROID_MOTION_REVISION)
    throw new Error(
      'This Android app needs the updated TURN sensor build (IMU 1). Install the latest APK over TURN, then reopen it. Reloading alone cannot add this sensor capture system.',
    );
  const native = TurnMotion;
  const normalize = createAndroidBatchNormalizer(sessionId);
  let active = true;
  let lastSequence = 0;
  const batchListener = native.addListener('onBatch', (batch) => {
    if (!active || batch.token !== sessionId) return;
    try {
      if (batch.sequence !== lastSequence + 1)
        throw new Error('Native motion batch missing or out of order');
      lastSequence = batch.sequence;
      consume(normalize(batch.samples));
    } catch (error) {
      failed(
        error instanceof Error
          ? error.message
          : 'Android motion capture failed',
      );
    } finally {
      native.acknowledge(sessionId, batch.sequence);
    }
  });
  const errorListener = native.addListener('onFailure', (error) => {
    if (active && error.token === sessionId) failed(error.message);
  });
  const stop = () => {
    active = false;
    native.stop(sessionId);
    batchListener.remove();
    errorListener.remove();
  };
  try {
    await native.start(sessionId);
  } catch (error) {
    stop();
    throw error;
  }
  return stop;
}

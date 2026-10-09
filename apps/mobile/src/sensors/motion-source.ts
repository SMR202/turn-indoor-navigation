import { Platform } from 'react-native';
import { DeviceMotion } from 'expo-sensors';
import { createMotionNormalizer } from './normalize-motion';
import type { Observation } from '@turn/contracts';
import { createSamplingHealth } from './sampling-health';

export async function startMotionSource(
  sessionId: string,
  consume: (value: Observation) => void,
  failed: (message: string) => void,
  beforeSubscribe: () => Promise<void>,
) {
  // Expo Android maps this permission API to ACTIVITY_RECOGNITION. That is
  // required for the optional step counter, not these raw motion sensors.
  // Check actual sensor availability/delivery on Android; preserve iOS consent.
  if (Platform.OS !== 'android') {
    const permission = await DeviceMotion.requestPermissionsAsync();
    if (!permission.granted)
      throw new Error(
        'Motion permission denied. Enable Motion & Fitness for Expo Go in iOS settings.',
      );
  }
  if (!(await DeviceMotion.isAvailableAsync()))
    throw new Error('DeviceMotion is unavailable on this phone.');
  await beforeSubscribe();
  const normalize = createMotionNormalizer(
    sessionId,
    Platform.OS === 'ios' ? 'ios' : 'android',
  );
  DeviceMotion.setUpdateInterval(20);
  const startedAt = performance.now();
  const health = createSamplingHealth(startedAt);
  let failureReported = false;
  const reportFailure = (message: string) => {
    if (failureReported) return;
    failureReported = true;
    failed(message);
  };
  let lastUsableEvent: number | null = null;
  const subscription = DeviceMotion.addListener((sample) => {
    try {
      const observations = normalize(sample);
      if (observations.some((o) => o.type === 'accelerometer'))
        lastUsableEvent = performance.now();
      for (const observation of observations) {
        health.observe(observation, performance.now());
        consume(observation);
      }
    } catch (error) {
      reportFailure(
        error instanceof Error ? error.message : 'Motion adapter failed',
      );
    }
  });
  const watchdog = setInterval(() => {
    if (lastUsableEvent === null) {
      if (performance.now() - startedAt > 5000)
        reportFailure(
          'Motion sensors did not initialise within 5s. This phone may lack required gravity or rotation sensors.',
        );
    } else if (performance.now() - lastUsableEvent > 1500)
      reportFailure('No fresh usable motion samples for 1.5s. Re-anchor.');
    else if (Platform.OS === 'android') {
      const problem = health.problem(performance.now());
      if (problem) reportFailure(problem);
    }
  }, 500);
  return () => {
    subscription.remove();
    clearInterval(watchdog);
  };
}

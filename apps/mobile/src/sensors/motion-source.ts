import { Platform } from 'react-native';
import { DeviceMotion } from 'expo-sensors';
import { createMotionNormalizer } from './normalize-motion';
import type { Observation } from '@turn/contracts';

export async function startMotionSource(
  sessionId: string,
  consume: (value: Observation) => void,
  failed: (message: string) => void,
) {
  const permission = await DeviceMotion.requestPermissionsAsync();
  if (!permission.granted)
    throw new Error(
      'Motion permission denied. Enable it in phone settings to test PDR.',
    );
  if (!(await DeviceMotion.isAvailableAsync()))
    throw new Error('DeviceMotion is unavailable on this phone.');
  const normalize = createMotionNormalizer(
    sessionId,
    Platform.OS === 'ios' ? 'ios' : 'android',
  );
  DeviceMotion.setUpdateInterval(20);
  const startedAt = performance.now();
  let lastUsableEvent: number | null = null;
  const subscription = DeviceMotion.addListener((sample) => {
    try {
      const observations = normalize(sample);
      if (observations.some((o) => o.type === 'accelerometer'))
        lastUsableEvent = performance.now();
      for (const observation of observations) consume(observation);
    } catch (error) {
      failed(error instanceof Error ? error.message : 'Motion adapter failed');
    }
  });
  const watchdog = setInterval(() => {
    if (lastUsableEvent === null) {
      if (performance.now() - startedAt > 5000)
        failed(
          'Motion sensors did not initialise within 5s. This phone may lack required gravity or rotation sensors.',
        );
    } else if (performance.now() - lastUsableEvent > 1500)
      failed('No fresh usable motion samples for 1.5s. Re-anchor.');
  }, 500);
  return () => {
    subscription.remove();
    clearInterval(watchdog);
  };
}

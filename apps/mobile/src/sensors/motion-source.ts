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
  let lastEvent = performance.now();
  const subscription = DeviceMotion.addListener((sample) => {
    lastEvent = performance.now();
    try {
      for (const observation of normalize(sample)) consume(observation);
    } catch (error) {
      failed(error instanceof Error ? error.message : 'Motion adapter failed');
    }
  });
  const watchdog = setInterval(() => {
    if (performance.now() - lastEvent > 1500)
      failed('No motion samples for 1.5s. Re-anchor.');
  }, 500);
  return () => {
    subscription.remove();
    clearInterval(watchdog);
  };
}

import {
  Accelerometer,
  Barometer,
  DeviceMotion,
  Gyroscope,
  Magnetometer,
} from 'expo-sensors';
import type { DeviceCapabilities } from '../performance';

const has = async (sensor: { isAvailableAsync: () => Promise<boolean> }) => {
  try {
    return await sensor.isAvailableAsync();
  } catch {
    return false;
  }
};

/** What this phone can sense, asked of the system (never assumed from the model). */
export async function detectCapabilities(): Promise<DeviceCapabilities> {
  const [motion, accelerometer, gyroscope, compass, barometer] =
    await Promise.all([
      has(DeviceMotion),
      has(Accelerometer),
      has(Gyroscope),
      has(Magnetometer),
      has(Barometer),
    ]);
  return { motion: motion || accelerometer, gyroscope, compass, barometer };
}

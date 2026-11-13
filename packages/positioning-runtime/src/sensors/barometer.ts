import { Barometer } from 'expo-sensors';

/**
 * The phone's pressure sensor, for floor changes (Plan 005 §6.2). Feature-detected: iPhones and
 * most mid-range and flagship Android phones have one, many budget phones do not, and the web
 * never does. Without it floors come from beacons and the walker's confirmation.
 */
export async function barometerAvailable(): Promise<boolean> {
  try {
    return await Barometer.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Pressure in hPa about twice a second with a monotonic time in seconds. Returns the function
 * that stops it. Never throws: a failing sensor simply delivers nothing.
 */
export function watchPressure(
  onSample: (sample: { t: number; pressureHPa: number }) => void,
  intervalMs = 500,
): () => void {
  try {
    Barometer.setUpdateInterval(intervalMs);
    const sub = Barometer.addListener((m) => {
      if (Number.isFinite(m.pressure) && m.pressure > 300 && m.pressure < 1200)
        onSample({ t: performance.now() / 1000, pressureHPa: m.pressure });
    });
    return () => sub.remove();
  } catch {
    return () => undefined;
  }
}

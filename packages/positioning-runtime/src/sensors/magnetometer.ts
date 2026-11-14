import { Magnetometer } from 'expo-sensors';

/**
 * The magnetic field vector in µT about five times a second, for noticing when the compass
 * cannot be trusted (see `MagneticMonitor`). Feature-detected; never throws. Returns the function
 * that stops it.
 */
export async function watchMagneticField(
  onSample: (sample: { t: number; x: number; y: number; z: number }) => void,
  intervalMs = 200,
): Promise<() => void> {
  try {
    if (!(await Magnetometer.isAvailableAsync())) return () => undefined;
    Magnetometer.setUpdateInterval(intervalMs);
    const sub = Magnetometer.addListener((m) => {
      if (Number.isFinite(m.x) && Number.isFinite(m.y) && Number.isFinite(m.z))
        onSample({ t: performance.now() / 1000, x: m.x, y: m.y, z: m.z });
    });
    return () => sub.remove();
  } catch {
    return () => undefined;
  }
}

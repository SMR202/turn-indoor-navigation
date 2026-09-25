import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

const key = 'turn-step-length-v1';
export function clearCalibration() {
  if (Platform.OS === 'web') localStorage.removeItem(key);
  else {
    const file = new File(Paths.document, `${key}.json`);
    if (file.exists) file.delete();
  }
}
export async function loadCalibration(): Promise<number | null> {
  try {
    const file =
      Platform.OS === 'web' ? null : new File(Paths.document, `${key}.json`);
    const raw =
      Platform.OS === 'web'
        ? localStorage.getItem(key)
        : file!.exists
          ? await file!.text()
          : null;
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= 0.3 &&
      value <= 1.2
      ? value
      : null;
  } catch {
    return null;
  }
}
export function saveCalibration(value: number) {
  if (!Number.isFinite(value) || value < 0.3 || value > 1.2)
    throw new Error('Invalid step length');
  if (Platform.OS === 'web') localStorage.setItem(key, JSON.stringify(value));
  else {
    const file = new File(Paths.document, `${key}.json`);
    file.create({ overwrite: true });
    file.write(JSON.stringify(value));
  }
}

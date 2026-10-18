import { Directory, File, Paths } from 'expo-file-system';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

const DIR = 'turn-app';

/** Small JSON values on the device (preferences, saved places, cached venues). Best effort. */
export function load<T>(key: string, fallback: T): T {
  try {
    let raw: string | null = null;
    if (Platform.OS === 'web')
      raw = globalThis.localStorage?.getItem(`turn.${key}`) ?? null;
    else {
      const file = new File(Paths.document, DIR, `${key}.json`);
      raw = file.exists ? file.textSync() : null;
    }
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    const raw = JSON.stringify(value);
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(`turn.${key}`, raw);
      return;
    }
    const dir = new Directory(Paths.document, DIR);
    dir.create({ intermediates: true, idempotent: true });
    const file = new File(dir, `${key}.json`);
    file.create({ overwrite: true });
    file.write(raw);
  } catch {
    // Persistence must never break navigation.
  }
}

/** useState that survives restarts. */
export function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => load(key, initial));
  const set = useCallback(
    (next: T | ((prev: T) => T)) =>
      setValue((prev) => {
        const v =
          typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        save(key, v);
        return v;
      }),
    [key],
  );
  return [value, set] as const;
}

export type Preferences = {
  onboarded: boolean;
  stepFree: boolean;
  shareUsage: boolean;
  theme: 'system' | 'light' | 'dark';
};
export const defaultPreferences: Preferences = {
  onboarded: false,
  stepFree: false,
  shareUsage: true,
  theme: 'system',
};

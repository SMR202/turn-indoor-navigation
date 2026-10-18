import { createContext, useContext, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import {
  categoryColors,
  darkColors,
  darkMap,
  fonts,
  lightColors,
  lightMap,
  type MapPalette,
  type PlaceCategory,
  type ThemeColors,
} from '@turn/design';
import { defaultPreferences, useStored, type Preferences } from './lib/storage';

export type Theme = { dark: boolean; c: ThemeColors; map: MapPalette };
const LIGHT: Theme = { dark: false, c: lightColors, map: lightMap };
const DARK: Theme = { dark: true, c: darkColors, map: darkMap };

type PrefsContext = {
  prefs: Preferences;
  setPrefs: (p: Partial<Preferences>) => void;
};
const Prefs = createContext<PrefsContext>({
  prefs: defaultPreferences,
  setPrefs: () => {},
});

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, set] = useStored<Preferences>('prefs', defaultPreferences);
  return (
    <Prefs.Provider
      value={{
        prefs: { ...defaultPreferences, ...prefs },
        setPrefs: (p) => set((old) => ({ ...old, ...p })),
      }}
    >
      {children}
    </Prefs.Provider>
  );
}
export const usePrefs = () => useContext(Prefs);

export function useTheme(): Theme {
  const system = useColorScheme();
  const { prefs } = usePrefs();
  const dark =
    prefs.theme === 'system' ? system === 'dark' : prefs.theme === 'dark';
  return dark ? DARK : LIGHT;
}

export const F = fonts;
export const catColor = (c: PlaceCategory | null | undefined) =>
  categoryColors[c ?? 'other'];

/** Soft, layered shadows (React Native 0.76+ supports CSS box-shadow on every platform). */
export function shadow(level: 'card' | 'floating' | 'sheet', dark: boolean) {
  const a = dark ? 0.5 : 1;
  if (level === 'card')
    return {
      boxShadow: `0 1px 2px rgba(11,18,32,${0.05 * a}), 0 4px 14px rgba(11,18,32,${0.06 * a})`,
    };
  if (level === 'sheet')
    return {
      boxShadow: `0 -2px 6px rgba(11,18,32,${0.04 * a}), 0 -12px 32px rgba(11,18,32,${0.1 * a})`,
    };
  return {
    boxShadow: `0 2px 4px rgba(11,18,32,${0.08 * a}), 0 10px 24px rgba(11,18,32,${0.14 * a})`,
  };
}

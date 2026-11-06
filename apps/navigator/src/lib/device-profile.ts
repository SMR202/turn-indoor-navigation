import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import {
  learn,
  resolveDeviceProfile,
  type DeviceProfile,
  type LearnedValues,
} from '@turn/positioning-runtime';
import { getJson, postJson } from './api';
import { load, save } from './storage';

/* eslint-disable @typescript-eslint/no-require-imports */
const Device =
  Platform.OS !== 'web' && requireOptionalNativeModule('ExpoDevice') !== null
    ? (require('expo-device') as typeof import('expo-device'))
    : null;
/* eslint-enable @typescript-eslint/no-require-imports */

const platform = Platform.OS === 'ios' ? 'ios' : 'android';
/** The phone model ("iPhone16,1", "Pixel 4a (5G)"), from expo-device when the build has it. */
export const deviceModel: string =
  Device?.modelId ??
  Device?.modelName ??
  ((Platform.constants as { Model?: string }).Model || 'unknown');

const OWN_KEY = 'device-learned';

/**
 * This phone's profile (ADR-0015): platform defaults, what phones of the same model learned
 * (from the venue server when reachable), and what this phone learned itself.
 */
export function useDeviceProfile(online: boolean): DeviceProfile {
  const [shared, setShared] = useState<LearnedValues | null>(() =>
    load<LearnedValues | null>(`device-shared-${deviceModel}`, null),
  );
  const [own, setOwn] = useState<LearnedValues | null>(() =>
    load<LearnedValues | null>(OWN_KEY, null),
  );
  useEffect(() => {
    if (!online || deviceModel === 'unknown') return;
    let live = true;
    getJson<LearnedValues | null>(
      `/public/device-profiles?platform=${platform}&model=${encodeURIComponent(deviceModel)}`,
    )
      .then((r) => {
        if (!live || r.status !== 200) return;
        save(`device-shared-${deviceModel}`, r.body);
        setShared(r.body);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [online]);
  // Learning elsewhere updates storage; pick it up when this screen mounts again.
  useEffect(() => setOwn(load<LearnedValues | null>(OWN_KEY, null)), []);
  return useMemo(
    () => resolveDeviceProfile(platform, deviceModel, shared, own),
    [shared, own],
  );
}

/** Blends what a confident walk taught into this phone's values; optionally shares them. */
export function rememberLearned(
  observed: { stepLengthMetres?: number; rssiOffsetDb?: number },
  share: boolean,
) {
  if (
    observed.stepLengthMetres === undefined &&
    observed.rssiOffsetDb === undefined
  )
    return;
  const next = learn(load<LearnedValues | null>(OWN_KEY, null), observed);
  save(OWN_KEY, next);
  if (share && deviceModel !== 'unknown')
    postJson('/public/device-profiles', {
      platform,
      model: deviceModel,
      ...observed,
    }).catch(() => undefined);
}

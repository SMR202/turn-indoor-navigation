import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import {
  detectCapabilities,
  FrameMeter,
  performanceTier,
  TIER_SETTINGS,
  type DeviceCapabilities,
  type PerformanceTier,
} from '@turn/positioning-runtime';
import { load, save } from './storage';

/* eslint-disable @typescript-eslint/no-require-imports */
const Device =
  Platform.OS !== 'web' && requireOptionalNativeModule('ExpoDevice') !== null
    ? (require('expo-device') as typeof import('expo-device'))
    : null;
/* eslint-enable @typescript-eslint/no-require-imports */

const memoryGb = Device?.totalMemory ? Device.totalMemory / 1024 ** 3 : null;
const yearClass = Device?.deviceYearClass ?? null;

/** Measured once per app run, remembered between runs so the first screen already fits. */
let measuredFrameMs: number | null = load<number | null>('frame-ms', null);
let measuring = false;
const listeners = new Set<() => void>();

function measureFrames() {
  if (measuring || typeof requestAnimationFrame !== 'function') return;
  measuring = true;
  const meter = new FrameMeter(90);
  const started = Date.now();
  const tick = (t: number) => {
    meter.add(t);
    // About three seconds of frames, or give up after ten (the app went to the background).
    if (!meter.ready && Date.now() - started < 10000) {
      requestAnimationFrame(tick);
      return;
    }
    if (meter.medianMs !== null) {
      measuredFrameMs = meter.medianMs;
      save('frame-ms', measuredFrameMs);
      for (const l of listeners) l();
    }
  };
  requestAnimationFrame(tick);
}

/**
 * This phone's tier (Plan 005 §12): full, balanced or light, from its memory and age and from how
 * smoothly it actually draws. `saving` (the "simple map" setting) forces light.
 */
export function usePerformance(saving: boolean) {
  const [, bump] = useState(0);
  useEffect(() => {
    const on = () => bump((n) => n + 1);
    listeners.add(on);
    measureFrames();
    return () => {
      listeners.delete(on);
    };
  }, []);
  const tier: PerformanceTier = performanceTier({
    frameMs: measuredFrameMs,
    memoryGb,
    yearClass,
    saving,
  });
  return { tier, settings: TIER_SETTINGS[tier], frameMs: measuredFrameMs };
}

/** What this phone can sense (null while being asked; the web has none of it). */
export function useCapabilities(): DeviceCapabilities | null {
  const [caps, setCaps] = useState<DeviceCapabilities | null>(null);
  useEffect(() => {
    let alive = true;
    void detectCapabilities().then((c) => alive && setCaps(c));
    return () => {
      alive = false;
    };
  }, []);
  return caps;
}

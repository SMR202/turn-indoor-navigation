/**
 * Device profiles (ADR-0015): what positioning should assume about this phone. Three layers, later
 * ones refining earlier ones: platform defaults, what other phones of the same model learned
 * (shared through the venue server), and what this phone learned itself on confident walks.
 */
export type DevicePlatform = 'ios' | 'android';
export type DeviceProfile = {
  platform: DevicePlatform;
  /** Model identifier (e.g. "iPhone16,1", "Pixel 4a (5G)"); "unknown" when the OS hides it. */
  model: string;
  /** Step length used before the filter learns the walker's own (metres). */
  stepLengthMetres: number;
  /**
   * Expected RSSI offset (dB) of this phone against the phone that calibrated the venue's beacons:
   * the centre of the filter's per-update offset prior.
   */
  rssiOffsetDb: number;
  /** Radio window: iPhones report each iBeacon about once a second, Android every packet. */
  scan: { windowSeconds: number; minPackets: number };
  source: 'platform' | 'model' | 'learned';
};
export type LearnedValues = {
  stepLengthMetres?: number;
  rssiOffsetDb?: number;
  /** Confident walks the values are based on. */
  samples: number;
};

const PLATFORM: Record<
  DevicePlatform,
  Omit<DeviceProfile, 'model' | 'source'>
> = {
  // PROPOSED defaults: average adult stride (0.68 m) until the filter learns this walker's.
  ios: {
    platform: 'ios',
    stepLengthMetres: 0.68,
    rssiOffsetDb: 0,
    scan: { windowSeconds: 4, minPackets: 2 },
  },
  android: {
    platform: 'android',
    stepLengthMetres: 0.68,
    rssiOffsetDb: 0,
    scan: { windowSeconds: 2.5, minPackets: 3 },
  },
};

const clampStride = (m: number) => Math.min(0.95, Math.max(0.45, m));
const clampOffset = (db: number) => Math.min(12, Math.max(-12, db));

/** The profile for this phone from its layers; missing layers fall back to the one below. */
export function resolveDeviceProfile(
  platform: DevicePlatform,
  model: string,
  shared: LearnedValues | null,
  own: LearnedValues | null,
): DeviceProfile {
  const base = PLATFORM[platform];
  let profile: DeviceProfile = { ...base, model, source: 'platform' };
  for (const [layer, source] of [
    [shared, 'model'],
    [own, 'learned'],
  ] as const) {
    if (!layer || layer.samples < 1) continue;
    profile = {
      ...profile,
      ...(layer.stepLengthMetres !== undefined
        ? { stepLengthMetres: clampStride(layer.stepLengthMetres) }
        : {}),
      ...(layer.rssiOffsetDb !== undefined
        ? { rssiOffsetDb: clampOffset(layer.rssiOffsetDb) }
        : {}),
      source,
    };
  }
  return profile;
}

/**
 * Blends one confident observation into learned values: an exponential average that trusts the
 * first walks fully and later ones a little (so a single odd walk cannot move it far).
 */
export function learn(
  prev: LearnedValues | null,
  observed: { stepLengthMetres?: number; rssiOffsetDb?: number },
): LearnedValues {
  const n = prev?.samples ?? 0;
  const w = Math.max(0.1, 1 / (n + 1));
  const blend = (old: number | undefined, value: number | undefined) =>
    value === undefined
      ? old
      : old === undefined
        ? value
        : old + w * (value - old);
  return {
    stepLengthMetres: blend(
      prev?.stepLengthMetres,
      observed.stepLengthMetres === undefined
        ? undefined
        : clampStride(observed.stepLengthMetres),
    ),
    rssiOffsetDb: blend(
      prev?.rssiOffsetDb,
      observed.rssiOffsetDb === undefined
        ? undefined
        : clampOffset(observed.rssiOffsetDb),
    ),
    samples: n + 1,
  };
}

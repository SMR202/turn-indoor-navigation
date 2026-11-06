/**
 * Phone compasses and venue maps (ADR-0014). Positioning works with a north offset: the venue
 * heading minus the phone's compass yaw. It can be learned on a walk (exact for that platform) or
 * derived from the venue's georeference with each platform's compass zero:
 *
 * - Android: yaw is minus the rotation-vector azimuth, so the compass bearing of the phone's top
 *   is −yaw (zero 0°).
 * - iPhone: Core Motion yaw in `xMagneticNorthZVertical` is zero when the phone's right edge points
 *   north, so the top's bearing is 270° − yaw (zero 270°). EXPECTED from Apple's reference-frame
 *   definition; a learned offset from a real walk replaces it.
 */
export type CompassPlatform = 'ios' | 'android';
export const COMPASS_ZERO_DEG: Record<CompassPlatform, number> = {
  android: 0,
  ios: 270,
};
const RAD = Math.PI / 180;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export type VenueOrientation = {
  georeference: {
    bearingDeg: number;
    declinationDeg?: number;
  } | null;
  learned: Partial<
    Record<CompassPlatform, { northOffsetRad: number; samples: number }>
  >;
};

/** North offset implied by the venue's map bearing for this platform's compass. */
export function northOffsetFromBearing(
  g: { bearingDeg: number; declinationDeg?: number },
  platform: CompassPlatform,
) {
  return wrap(
    (g.bearingDeg + 90 - (g.declinationDeg ?? 0) - COMPASS_ZERO_DEG[platform]) *
      RAD,
  );
}

export type StartHeading = {
  northOffset: number;
  /** Where it came from, best first. */
  source: 'this-phone' | 'other-phones' | 'venue-bearing';
  /** Start heading spread to use (rad): learned offsets are tighter than a map bearing. */
  sigma: number;
};

/**
 * The best compass start for a walk: this phone's own learned offset, then what other phones of
 * the same platform learned in this venue, then the venue's map bearing. Null: nothing known.
 */
export function startHeading(
  platform: CompassPlatform,
  own: number | null,
  orientation: VenueOrientation | null,
): StartHeading | null {
  if (own !== null)
    return { northOffset: own, source: 'this-phone', sigma: 0.45 };
  const crowd = orientation?.learned[platform];
  if (crowd && crowd.samples >= 2)
    return {
      northOffset: crowd.northOffsetRad,
      source: 'other-phones',
      sigma: 0.5,
    };
  if (orientation?.georeference)
    return {
      northOffset: northOffsetFromBearing(orientation.georeference, platform),
      source: 'venue-bearing',
      sigma: 0.6,
    };
  return null;
}

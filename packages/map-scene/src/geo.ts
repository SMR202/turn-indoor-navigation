import type { P } from './scene';

/**
 * Where a venue's map sits on Earth (ADR-0014): the map origin (0, 0) at `lat`/`lon`, and the
 * compass bearing of the map's +y axis in degrees clockwise from true north. Venue coordinates are
 * metres, x right and y up.
 */
export type Georeference = {
  lat: number;
  lon: number;
  bearingDeg: number;
};
/** Used when a venue has no georeference yet: the plan's own "up" is drawn as north. */
export const NEUTRAL_GEOREFERENCE: Georeference = {
  lat: 0,
  lon: 0,
  bearingDeg: 0,
};

const EARTH_RADIUS = 6378137;
const RAD = Math.PI / 180;

/** Venue metres to [longitude, latitude] (local tangent plane; exact to millimetres over a campus). */
export function toLngLat(p: P, g: Georeference): [number, number] {
  const t = g.bearingDeg * RAD;
  const east = p.x * Math.cos(t) + p.y * Math.sin(t);
  const north = -p.x * Math.sin(t) + p.y * Math.cos(t);
  return [
    g.lon + east / (EARTH_RADIUS * Math.cos(g.lat * RAD)) / RAD,
    g.lat + north / EARTH_RADIUS / RAD,
  ];
}

/** [longitude, latitude] back to venue metres. */
export function fromLngLat(ll: readonly [number, number], g: Georeference): P {
  const east = (ll[0] - g.lon) * RAD * EARTH_RADIUS * Math.cos(g.lat * RAD);
  const north = (ll[1] - g.lat) * RAD * EARTH_RADIUS;
  const t = g.bearingDeg * RAD;
  return {
    x: east * Math.cos(t) - north * Math.sin(t),
    y: east * Math.sin(t) + north * Math.cos(t),
  };
}

/** A venue heading (radians, counter-clockwise from +x) as a compass bearing in degrees. */
export function headingToBearing(headingRad: number, g: Georeference): number {
  return normaliseDeg(g.bearingDeg + 90 - headingRad / RAD);
}
/** A compass bearing in degrees as a venue heading (radians, counter-clockwise from +x). */
export function bearingToHeading(bearingDeg: number, g: Georeference): number {
  const h = (g.bearingDeg + 90 - bearingDeg) * RAD;
  return Math.atan2(Math.sin(h), Math.cos(h));
}
export function normaliseDeg(d: number) {
  return ((d % 360) + 360) % 360;
}

/** Map zoom (512-pixel tiles) at which one screen pixel covers `metres`. */
export function zoomForMetresPerPixel(metres: number, lat: number) {
  return Math.log2((40075016.686 * Math.cos(lat * RAD)) / (512 * metres));
}
/** Metres covered by one screen pixel at `zoom`. */
export function metresPerPixel(zoom: number, lat: number) {
  return (40075016.686 * Math.cos(lat * RAD)) / (512 * 2 ** zoom);
}

/** A satellite position fix from the phone. */
export type GpsFix = {
  lat: number;
  lon: number;
  /** The phone's own estimate of the error radius (metres, about 68%). */
  accuracyMetres: number;
};
export type Entrance = P & { id: string; floorId: string };

/**
 * A GPS fix as a way in (Plan 005 §7.1): outdoors the phone knows where it is, so on arrival the
 * nearest entrance is a good first position for the indoor filter. Returns null when the fix is
 * too vague to trust (GPS indoors, or under a canopy) or nowhere near a door of this venue.
 *
 * The result is the entrance, not the raw fix: a walker reported 8 m from a door is almost
 * certainly at it, and starting on the walk graph lets the first steps settle the rest.
 */
export function entryFix(
  fix: GpsFix,
  g: Georeference,
  entrances: Entrance[],
  options: { maxAccuracyMetres?: number; withinMetres?: number } = {},
): (Entrance & { sigmaMetres: number; distanceMetres: number }) | null {
  const maxAccuracy = options.maxAccuracyMetres ?? 25;
  if (
    !Number.isFinite(fix.accuracyMetres) ||
    fix.accuracyMetres <= 0 ||
    fix.accuracyMetres > maxAccuracy
  )
    return null;
  const p = fromLngLat([fix.lon, fix.lat], g);
  let best: { e: Entrance; d: number } | null = null;
  for (const e of entrances) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (!best || d < best.d) best = { e, d };
  }
  // The door must be believable from where the phone says it is.
  if (!best || best.d > (options.withinMetres ?? 20) + fix.accuracyMetres)
    return null;
  return {
    ...best.e,
    distanceMetres: best.d,
    // Never tighter than a doorway and its approach, however confident the phone claims to be.
    sigmaMetres: Math.max(3, Math.min(10, fix.accuracyMetres)),
  };
}

/**
 * The venue a GPS fix is at, for opening the right map by itself: the nearest venue whose centre
 * is within its radius plus the fix's own error. Null when none is.
 */
export function venueAt<
  T extends { georeference: Georeference; radiusMetres: number },
>(fix: GpsFix, venues: T[]): T | null {
  let best: { v: T; d: number } | null = null;
  for (const v of venues) {
    const p = fromLngLat([fix.lon, fix.lat], v.georeference);
    const d = Math.hypot(p.x, p.y);
    if (d <= v.radiusMetres + fix.accuracyMetres && (!best || d < best.d))
      best = { v, d };
  }
  return best?.v ?? null;
}

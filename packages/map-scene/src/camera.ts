import { pointAlong, polylineLength } from './route';
import type { P } from './scene';

/**
 * The camera director (Plan 005 §5.2): decides how the map should look at the walker while a
 * route is being followed. Pure: renderers only ease towards what it returns.
 *
 * The map turns with the **route** (course-up), not with the compass: a magnetometer indoors
 * swings by tens of degrees, and a map that swings with it is unreadable. The direction is taken
 * to a point a few metres ahead on the route, so the view starts to turn before a corner and
 * finishes after it, as car navigation does.
 */
export type FollowInput = {
  /** The leg being walked, in venue metres; null when there is no route. */
  route: P[] | null;
  /** Metres walked along that leg. */
  along: number;
  /** Metres to the next turn or floor change; null when none is left on this leg. */
  toManoeuvre: number | null;
  /** True when this leg ends at the destination (not at stairs or a lift). */
  lastLeg: boolean;
  /** The walker's own heading (rad, venue frame) for when there is no route to follow. */
  heading: number | null;
  /** Width of the map on screen in pixels. */
  viewportWidth: number;
  /** 2D: look straight down. */
  flat?: boolean;
};
export type FollowCamera = {
  /** Venue direction (rad) that should point up the screen; null keeps the current one. */
  courseRad: number | null;
  pitchDeg: number;
  metresPerPixel: number;
  /** Where the dot sits, as a fraction of the way down the visible map. */
  dotAt: number;
  phase: 'cruise' | 'manoeuvre' | 'arrive';
};

/** How far ahead on the route the view aims (metres). */
export const LOOK_AHEAD_METRES = 7;
/** A turn or floor change this close switches to the closer manoeuvre view (metres). */
export const MANOEUVRE_METRES = 8;
/** The destination this close switches to the arrival view (metres). */
export const ARRIVE_METRES = 6;
/** Metres of floor across the screen in each phase. */
const SPAN = { cruise: 19, manoeuvre: 14.5, arrive: 13 } as const;
const PITCH = { cruise: 55, manoeuvre: 47, arrive: 40 } as const;
const DOT_AT = { cruise: 0.68, manoeuvre: 0.62, arrive: 0.55 } as const;

export function followCamera(input: FollowInput): FollowCamera {
  const route = input.route && input.route.length > 1 ? input.route : null;
  const length = route ? polylineLength(route) : 0;
  const remaining = Math.max(0, length - input.along);
  const phase: FollowCamera['phase'] =
    route && input.lastLeg && remaining <= ARRIVE_METRES
      ? 'arrive'
      : input.toManoeuvre !== null && input.toManoeuvre <= MANOEUVRE_METRES
        ? 'manoeuvre'
        : 'cruise';
  let courseRad: number | null = input.heading;
  if (route) {
    const here = pointAlong(route, input.along);
    const ahead = pointAlong(
      route,
      Math.min(length, input.along + LOOK_AHEAD_METRES),
    );
    const dx = ahead.x - here.x;
    const dy = ahead.y - here.y;
    // At the very end there is nothing ahead: keep the direction of the last stretch.
    courseRad = Math.hypot(dx, dy) > 0.5 ? Math.atan2(dy, dx) : here.headingRad;
  }
  return {
    courseRad,
    pitchDeg: input.flat ? 0 : PITCH[phase],
    metresPerPixel: Math.max(
      0.018,
      Math.min(0.09, SPAN[phase] / Math.max(240, input.viewportWidth)),
    ),
    dotAt: DOT_AT[phase],
    phase,
  };
}

/** Signed shortest turn from `from` to `to` in degrees (−180 … 180]. */
export function shortestTurnDeg(from: number, to: number) {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

/**
 * One frame of turning the map towards a bearing: eased, and never faster than `maxRate` degrees
 * per second, the short way round.
 */
export function stepBearing(
  current: number,
  target: number,
  dtMs: number,
  maxRate = 110,
  gain = 4.5,
) {
  // Long frames (a slow phone, a tab in the background) still turn at the full rate.
  const dt = Math.max(0, Math.min(1000, dtMs)) / 1000;
  const diff = shortestTurnDeg(current, target);
  const eased = diff * (1 - Math.exp(-gain * dt));
  const limit = maxRate * dt;
  return current + Math.max(-limit, Math.min(limit, eased));
}

/** One frame of easing a value (zoom, pitch) towards a target with time constant `tauMs`. */
export function stepTowards(
  current: number,
  target: number,
  dtMs: number,
  tauMs = 450,
) {
  const k = 1 - Math.exp(-Math.max(0, Math.min(1000, dtMs)) / tauMs);
  return current + (target - current) * k;
}

/**
 * The direction a route preview should be turned so it reads from the bottom of the screen to the
 * top: from the start towards the end. Null for routes too short to have a direction.
 */
export function previewCourse(points: P[]): number | null {
  const a = points[0];
  const b = points.at(-1);
  if (!a || !b || Math.hypot(b.x - a.x, b.y - a.y) < 2) return null;
  return Math.atan2(b.y - a.y, b.x - a.x);
}

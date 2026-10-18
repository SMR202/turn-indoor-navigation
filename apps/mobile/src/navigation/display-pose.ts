import { remainingRoute, type P } from './assist-helpers';

export type DisplayOptions = {
  /** Snap to the route when within this distance (metres). */
  snapMetres: number;
  /** Largest animated speed (m/s); bigger jumps are teleports only after an explicit fix. */
  maxSpeed: number;
  /** Smoothing time constant (seconds). */
  tau: number;
  /** Treat the user as standing after this many seconds without walking. */
  standStillSeconds: number;
  /** While standing, ignore estimate moves smaller than this (metres). */
  standDeadband: number;
};
export const DEFAULT_DISPLAY: DisplayOptions = {
  snapMetres: 2,
  maxSpeed: 2.5,
  tau: 0.35,
  standStillSeconds: 3,
  standDeadband: 0.6,
};

/**
 * What the blue dot shows, separate from what the filter believes (Plan 002 A3). Maps apps do this:
 * snap to the route when close, move smoothly, and do not wander while the user is standing.
 */
export class DisplayPose {
  private shown: P | null = null;
  private target: P | null = null;
  private lastWalkAt = -Infinity;
  private route: P[] | null = null;
  constructor(private readonly opts: DisplayOptions = DEFAULT_DISPLAY) {}

  setRoute(route: P[] | null) {
    this.route = route && route.length > 1 ? route : null;
  }
  /** Feed a new filter estimate. `walked` is true when this update came from a step. */
  update(est: P, now: number, walked: boolean, fix = false) {
    if (walked) this.lastWalkAt = now;
    let target = est;
    if (this.route) {
      const line = remainingRoute(this.route, est);
      const snapped = line[0]!;
      const d = Math.hypot(snapped.x - est.x, snapped.y - est.y);
      if (d <= this.opts.snapMetres) target = snapped;
    }
    const standing = now - this.lastWalkAt > this.opts.standStillSeconds;
    if (this.shown && standing && !fix) {
      // Standing: only a larger, evidence-backed move is allowed through.
      if (
        Math.hypot(target.x - this.shown.x, target.y - this.shown.y) <
        this.opts.standDeadband
      )
        return;
    }
    this.target = target;
    if (!this.shown || fix)
      this.shown = fix || !this.shown ? { ...target } : this.shown;
  }
  /** Advance the animation by dt seconds; returns the point to draw. */
  step(dt: number): P | null {
    if (!this.shown || !this.target) return this.shown;
    const dx = this.target.x - this.shown.x,
      dy = this.target.y - this.shown.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.005) return this.shown;
    const alpha = 1 - Math.exp(-dt / this.opts.tau);
    let move = dist * alpha;
    move = Math.min(move, this.opts.maxSpeed * dt, dist);
    this.shown = {
      x: this.shown.x + (dx / dist) * move,
      y: this.shown.y + (dy / dist) * move,
    };
    return this.shown;
  }
  current() {
    return this.shown;
  }
  reset() {
    this.shown = null;
    this.target = null;
    this.lastWalkAt = -Infinity;
  }
}

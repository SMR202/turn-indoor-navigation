import {
  Easing,
  makeMutable,
  ReduceMotion,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { DisplayPose, type DisplayMap } from '@turn/positioning-runtime';

type P = { x: number; y: number };
const TICK = 0.1;
// The glide is position feedback, not decoration: keep it with the system's reduce-motion setting.
const KEEP = ReduceMotion.Never;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Animated values the map reads on the UI thread; React never re-renders for them. */
export type LiveDotValues = {
  x: SharedValue<number>;
  y: SharedValue<number>;
  /** Venue heading (rad, unwrapped so rotations take the short way). */
  heading: SharedValue<number>;
  /** 1 while the heading is known, fading to 0 when not. */
  headingOn: SharedValue<number>;
  sigma: SharedValue<number>;
  /** Fades the dot in and out. */
  visible: SharedValue<number>;
  /** 1 while tracking, 0 while starting (drawn grey). */
  live: SharedValue<number>;
};

/**
 * Drives the live blue dot. The display pose (route snapping, moves through doors, standing hold)
 * is stepped ten times a second on the JS thread; each step hands the UI thread a 120 ms linear
 * animation to the next point, so the dot glides continuously at frame rate. Screens get a coarse
 * position three times a second for progress and re-routing.
 */
export class LiveDot {
  readonly values: LiveDotValues = {
    x: makeMutable(0),
    y: makeMutable(0),
    heading: makeMutable(0),
    headingOn: makeMutable(0),
    sigma: makeMutable(2),
    visible: makeMutable(0),
    live: makeMutable(0),
  };
  private display = new DisplayPose();
  private timer: ReturnType<typeof setInterval> | null = null;
  private shown: P | null = null;
  private lastSteps = -1;
  private ticks = 0;
  private unwrapped = 0;
  private headingKnown = false;
  private listeners = new Set<(p: P | null) => void>();
  private emitted: P | null = null;

  setMap(map: DisplayMap | null) {
    this.display.setMap(map);
  }
  setRoute(route: P[] | null) {
    this.display.setRoute(route);
  }
  /** A filter estimate: `steps` tells walking updates apart, `fix` jumps (tap, QR, floor change). */
  update(p: P & { sigma: number }, steps: number, fix: boolean) {
    const walked = steps !== this.lastSteps;
    this.lastSteps = steps;
    this.display.update(p, performance.now() / 1000, walked, fix);
    this.values.sigma.value = withTiming(p.sigma, { duration: 600 });
  }
  setTracking(tracking: boolean) {
    this.values.live.value = withTiming(tracking ? 1 : 0, { duration: 300 });
  }
  /** Starts animating; `heading` is read every tick (venue rad or null while unknown). */
  run(heading: () => number | null) {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(heading()), TICK * 1000);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.values.visible.value = withTiming(0, { duration: 250 });
    this.shown = null;
    this.lastSteps = -1;
    this.emitted = null;
    this.display.reset();
    for (const l of this.listeners) l(null);
  }
  current() {
    return this.shown;
  }
  /** Coarse position (about 3 Hz) for screens; returns the unsubscribe function. */
  subscribe(listener: (p: P | null) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private tick(heading: number | null) {
    const p = this.display.step(TICK);
    if (p) {
      const v = this.values;
      if (!this.shown) {
        v.x.value = p.x;
        v.y.value = p.y;
        v.visible.value = withTiming(1, { duration: 300 });
      } else if (p.x !== this.shown.x || p.y !== this.shown.y) {
        const cfg = {
          duration: TICK * 1000 + 20,
          easing: Easing.linear,
          reduceMotion: KEEP,
        };
        v.x.value = withTiming(p.x, cfg);
        v.y.value = withTiming(p.y, cfg);
      }
      this.shown = { x: p.x, y: p.y };
    }
    if (heading !== null) {
      this.unwrapped += wrap(heading - this.unwrapped);
      this.values.heading.value = withTiming(this.unwrapped, {
        duration: TICK * 1000 + 50,
        easing: Easing.linear,
        reduceMotion: KEEP,
      });
    }
    if ((heading !== null) !== this.headingKnown) {
      this.headingKnown = heading !== null;
      this.values.headingOn.value = withTiming(this.headingKnown ? 1 : 0, {
        duration: 400,
      });
    }
    // Screens hear about real moves only, so a standing walker causes no re-renders.
    const s = this.shown;
    const e = this.emitted;
    if (
      ++this.ticks % 3 === 0 &&
      s &&
      (!e || Math.hypot(s.x - e.x, s.y - e.y) >= 0.1)
    ) {
      this.emitted = s;
      for (const l of this.listeners) l(s);
    }
  }
}

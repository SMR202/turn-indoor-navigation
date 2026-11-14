/**
 * How much a phone can comfortably do (Plan 005 §12). TURN runs on phones from flagship to
 * budget: the map's detail and the positioning filter's load follow a tier decided from what the
 * phone reports and from what was measured in its first seconds, never from its brand.
 *
 * Pure: the app supplies the measurements.
 */
export type PerformanceTier = 'full' | 'balanced' | 'light';
export type TierSettings = {
  /** Hypotheses in the positioning filter. */
  particles: number;
  /** Tilted map with room blocks; false draws the flat map. */
  map3d: boolean;
  /** Camera updates per second while following on phones (each one is a bridge call). */
  cameraHz: number;
};
export const TIER_SETTINGS: Record<PerformanceTier, TierSettings> = {
  full: { particles: 800, map3d: true, cameraHz: 10 },
  balanced: { particles: 400, map3d: true, cameraHz: 10 },
  light: { particles: 200, map3d: false, cameraHz: 5 },
};

const ORDER: PerformanceTier[] = ['full', 'balanced', 'light'];
const worst = (a: PerformanceTier, b: PerformanceTier) =>
  ORDER[Math.max(ORDER.indexOf(a), ORDER.indexOf(b))]!;

export type PerformanceInput = {
  /** Median time between frames while the map was on screen (ms); 16.7 is a smooth 60 a second. */
  frameMs?: number | null;
  /** Memory in gigabytes, when the system reports it. */
  memoryGb?: number | null;
  /** The year whose flagship phones this model compares to, when known. */
  yearClass?: number | null;
  /** Battery saver is on, or the person asked for the simple map. */
  saving?: boolean;
};

/** The tier for this phone: the most cautious of what each sign suggests. */
export function performanceTier(input: PerformanceInput): PerformanceTier {
  if (input.saving) return 'light';
  let tier: PerformanceTier = 'full';
  const f = input.frameMs;
  if (f != null && Number.isFinite(f))
    tier = worst(tier, f > 34 ? 'light' : f > 22 ? 'balanced' : 'full');
  const m = input.memoryGb;
  if (m != null && m > 0)
    tier = worst(tier, m < 3 ? 'light' : m < 5 ? 'balanced' : 'full');
  const y = input.yearClass;
  if (y != null && y > 2000)
    tier = worst(tier, y < 2017 ? 'light' : y < 2020 ? 'balanced' : 'full');
  return tier;
}

/**
 * Measures frame pacing from animation-frame times. The median ignores the odd long frame (a
 * garbage collection, a screen transition); it is available after enough frames.
 */
export class FrameMeter {
  private last: number | null = null;
  private readonly gaps: number[] = [];
  constructor(
    private readonly needed = 60,
    private readonly keep = 240,
  ) {}
  add(timeMs: number) {
    if (this.last !== null) {
      const gap = timeMs - this.last;
      // A gap over half a second is the app being in the background, not a slow frame.
      if (gap > 0 && gap < 500) {
        this.gaps.push(gap);
        if (this.gaps.length > this.keep) this.gaps.shift();
      }
    }
    this.last = timeMs;
  }
  get ready() {
    return this.gaps.length >= this.needed;
  }
  /** Median frame gap in ms, or null until enough frames were seen. */
  get medianMs(): number | null {
    if (!this.ready) return null;
    const sorted = [...this.gaps].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)]!;
  }
}

/** What a phone can sense; each missing item has a fallback (Plan 005 §8). */
export type DeviceCapabilities = {
  /** Steps and turns. */
  motion: boolean;
  gyroscope: boolean;
  compass: boolean;
  /** Floor changes from air pressure. */
  barometer: boolean;
};
/** In plain words: what this phone does without, for the "This phone" panel. */
export function capabilityNotes(c: DeviceCapabilities): string[] {
  const notes: string[] = [];
  if (!c.motion)
    notes.push(
      'No motion sensors: your position cannot follow you. Routes are shown step by step.',
    );
  else if (!c.gyroscope)
    notes.push(
      'No gyroscope: turns are followed with the compass only, so the direction is less steady.',
    );
  if (c.motion && !c.compass)
    notes.push(
      'No compass: the app asks which way you face when you start a route.',
    );
  if (!c.barometer)
    notes.push(
      'No pressure sensor: floors change from venue beacons, or when you confirm the new floor.',
    );
  return notes;
}

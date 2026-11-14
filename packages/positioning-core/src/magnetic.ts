/**
 * Notices when the phone's compass cannot be trusted (Plan 005 §7.2). Indoors, steel, lifts and
 * cables bend the magnetic field; the phone's heading then swings by tens of degrees. The field's
 * *strength* gives it away: undisturbed, it is steady (25–65 µT anywhere on Earth); near steel it
 * jumps and wobbles as the walker moves.
 *
 * The monitor turns strength samples into a disturbance level from 0 (calm) to 1 (heavy). The
 * filter uses it to trust the heading less for the steps taken there, so walls and beacons, not
 * the compass, decide the direction. Pure; thresholds are defaults to be tuned from recordings.
 */
export type MagneticState = {
  /** Field strength now, lightly smoothed (µT). */
  strength: number;
  /** What this place usually reads (µT), learned while calm. */
  baseline: number;
  /** 0 calm … 1 heavily disturbed. */
  disturbance: number;
};
export type MagneticConfig = {
  /** Fraction of the baseline by which the strength may differ before it counts (0.08). */
  calmDeviation: number;
  /** Deviation that counts as fully disturbed (0.35). */
  heavyDeviation: number;
  /** Wobble (µT, standard deviation over a few seconds) that counts as fully disturbed. */
  heavyWobble: number;
  /** Seconds over which the baseline follows the strength while calm. */
  baselineSeconds: number;
};
export const DEFAULT_MAGNETIC: MagneticConfig = {
  calmDeviation: 0.08,
  heavyDeviation: 0.35,
  heavyWobble: 9,
  baselineSeconds: 40,
};

/** Earth's field is between about 22 and 67 µT everywhere on the surface. */
const EARTH_MIN = 20;
const EARTH_MAX = 72;

export class MagneticMonitor {
  private readonly cfg: MagneticConfig;
  private lastT: number | null = null;
  private strength: number | null = null;
  private baseline: number | null = null;
  private recent: { t: number; b: number }[] = [];
  private level = 0;

  constructor(config: Partial<MagneticConfig> = {}) {
    this.cfg = { ...DEFAULT_MAGNETIC, ...config };
  }

  get state(): MagneticState | null {
    return this.strength === null || this.baseline === null
      ? null
      : {
          strength: this.strength,
          baseline: this.baseline,
          disturbance: this.level,
        };
  }
  /** 0 before any sample: no evidence of disturbance is not evidence of calm, but it is the default. */
  get disturbance() {
    return this.level;
  }

  /** One magnetometer sample: time in seconds and the field vector in µT. */
  update(sample: {
    t: number;
    x: number;
    y: number;
    z: number;
  }): MagneticState {
    const b = Math.hypot(sample.x, sample.y, sample.z);
    const dt =
      this.lastT === null ? 0 : Math.max(0, Math.min(2, sample.t - this.lastT));
    this.lastT = sample.t;
    if (this.strength === null || this.baseline === null) {
      this.strength = b;
      // A first reading outside Earth's range is itself a disturbance: start from a typical value.
      this.baseline = b >= EARTH_MIN && b <= EARTH_MAX ? b : 48;
    } else {
      this.strength += (b - this.strength) * (1 - Math.exp(-dt / 0.3));
    }
    this.recent.push({ t: sample.t, b });
    while (this.recent.length > 200 || this.recent[0]!.t < sample.t - 3)
      this.recent.shift();
    const mean = this.recent.reduce((s, r) => s + r.b, 0) / this.recent.length;
    const wobble = Math.sqrt(
      this.recent.reduce((s, r) => s + (r.b - mean) ** 2, 0) /
        this.recent.length,
    );
    const deviation = Math.abs(this.strength - this.baseline) / this.baseline;
    const ramp = (v: number, calm: number, heavy: number) =>
      Math.max(0, Math.min(1, (v - calm) / (heavy - calm)));
    const outside =
      this.strength < EARTH_MIN || this.strength > EARTH_MAX ? 0.7 : 0;
    const now = Math.max(
      ramp(deviation, this.cfg.calmDeviation, this.cfg.heavyDeviation),
      ramp(wobble, 2, this.cfg.heavyWobble),
      outside,
    );
    // Rise at once, fall slowly: the compass stays wrong for a while after the steel is passed.
    this.level =
      now >= this.level
        ? now
        : this.level + (now - this.level) * (1 - Math.exp(-dt / 4));
    // The baseline follows only while calm, so a long disturbance cannot become "normal".
    if (now < 0.15 && outside === 0)
      this.baseline +=
        (this.strength - this.baseline) *
        (1 - Math.exp(-dt / this.cfg.baselineSeconds));
    return this.state!;
  }
}

/** How much less to trust the heading for a disturbance level: 1 (calm) to 4 (heavy). */
export const headingNoiseFactorFor = (disturbance: number) =>
  1 + 3 * Math.max(0, Math.min(1, disturbance));

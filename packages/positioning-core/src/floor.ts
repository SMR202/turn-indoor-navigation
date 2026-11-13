/**
 * Which floor the walker is on (Plan 005 §6.2).
 *
 * Two parts, both pure and deterministic:
 *
 * 1. `FloorChangeDetector` turns barometric pressure into floor-change events. Only the *change*
 *    of height over tens of seconds is used: weather moves pressure by about 1 hPa an hour
 *    (0.002 m/s of apparent height), stairs climb at 0.15–0.6 m/s and lifts at 0.5–2.5 m/s.
 * 2. `FloorBelief` keeps a probability for every floor and combines the barometer events with
 *    beacons (each beacon belongs to a floor; a concrete slab costs 15–20 dB) and with what the
 *    route expects at stairs and lifts. No single source decides alone.
 *
 * Nothing here has been validated in a building yet: thresholds are defaults to be tuned from
 * recordings (door and ventilation pressure steps differ per building).
 */

/** Height (m) for a pressure (hPa) by the international barometric formula. Only differences matter here. */
export function pressureAltitude(hPa: number, seaLevelHPa = 1013.25): number {
  return 44330 * (1 - Math.pow(hPa / seaLevelHPa, 0.190263));
}

export type FloorChangeConfig = {
  /** Height of one storey in metres (venue default 3.6; learned per venue when confirmed). */
  floorHeight: number;
  /** A settled change of at least this fraction of a storey counts as a floor (0.6). */
  threshold: number;
  /** Vertical speed (m/s) under which the walker is "level". */
  quietSpeed: number;
  /** Seconds of level walking after a change before it is declared. */
  settleSeconds: number;
  /**
   * A change that completes faster than this (seconds from 20% to 80% of it) is a pressure step
   * (a door, ventilation), not a person: even a lift takes longer over one storey.
   */
  minRiseSeconds: number;
  /** Time constant (s) for following slow weather drift while level. */
  driftSeconds: number;
  /** A change between a quarter storey and the threshold that stays this long is accepted as level (s). */
  staleSeconds: number;
};
export const DEFAULT_FLOOR_CHANGE: FloorChangeConfig = {
  floorHeight: 3.6,
  threshold: 0.6,
  quietSpeed: 0.06,
  settleSeconds: 2.5,
  minRiseSeconds: 1.2,
  driftSeconds: 60,
  staleSeconds: 25,
};

export type FloorChangeEvent = {
  /** Session time of the decision (s). */
  t: number;
  /** Storeys moved: positive up, negative down. */
  floors: number;
  /** The height change measured (m). */
  deltaMetres: number;
  /** How long the change took (s). */
  durationSeconds: number;
  /** How the walker travelled, from the climb rate and whether they were stepping. */
  via: 'stairs' | 'lift' | 'escalator' | 'unknown';
  /** 0–1: how cleanly the change matched whole storeys. */
  confidence: number;
};
export type FloorChangeState = {
  /** Height relative to the last level reference (m). */
  relativeMetres: number;
  /** Smoothed vertical speed (m/s). */
  verticalSpeed: number;
  /** True while a height change is in progress. */
  moving: boolean;
};

export class FloorChangeDetector {
  private readonly cfg: FloorChangeConfig;
  private lastT: number | null = null;
  private h: number | null = null;
  private hSlow: number | null = null;
  private v = 0;
  private ref: number | null = null;
  private quietFor = 0;
  private movingSince: number | null = null;
  private fast: number | null = null;
  private recent: { t: number; level: number }[] = [];
  private steppingTime = 0;
  private movingTime = 0;
  private offLevelFor = 0;

  constructor(config: Partial<FloorChangeConfig> = {}) {
    this.cfg = { ...DEFAULT_FLOOR_CHANGE, ...config };
  }

  get state(): FloorChangeState {
    return {
      relativeMetres:
        this.h !== null && this.ref !== null ? this.h - this.ref : 0,
      verticalSpeed: this.v,
      moving: this.movingSince !== null,
    };
  }

  /** Forget everything (a new walk, or the sensor restarted). */
  reset() {
    this.lastT = this.h = this.hSlow = this.ref = this.fast = null;
    this.recent = [];
    this.v = this.quietFor = 0;
    this.steppingTime = this.movingTime = this.offLevelFor = 0;
    this.movingSince = null;
  }

  /**
   * Feed one pressure sample. `stepping` says whether steps were detected in the last couple of
   * seconds (tells stairs from a lift). Returns an event when a floor change has just settled.
   */
  update(sample: {
    /** Session time in seconds (monotonic). */
    t: number;
    pressureHPa: number;
    stepping?: boolean;
  }): FloorChangeEvent | null {
    const alt = pressureAltitude(sample.pressureHPa);
    if (this.lastT === null || this.h === null || this.hSlow === null) {
      this.lastT = sample.t;
      this.h = this.hSlow = this.ref = this.fast = alt;
      return null;
    }
    const dt = sample.t - this.lastT;
    // A long gap (the app was in the background): start again rather than invent a change.
    if (dt <= 0) return null;
    if (dt > 8) {
      this.reset();
      return this.update(sample);
    }
    this.lastT = sample.t;
    // Two smoothings: a quick one for height, a slower one whose slope is the vertical speed.
    const prevSlow = this.hSlow;
    this.h += (alt - this.h) * (1 - Math.exp(-dt / 1.2));
    this.hSlow += (alt - this.hSlow) * (1 - Math.exp(-dt / 2.5));
    const rawSpeed = (this.hSlow - prevSlow) / dt;
    this.v += (rawSpeed - this.v) * (1 - Math.exp(-dt / 1.5));
    const ref = this.ref ?? this.h;
    const delta = this.h - ref;
    // A lightly smoothed height against the level reference, kept for timing how fast a change was.
    this.fast =
      (this.fast ?? alt) +
      (alt - (this.fast ?? alt)) * (1 - Math.exp(-dt / 0.4));
    this.recent.push({ t: sample.t, level: this.fast - ref });
    while (this.recent.length > 400 || this.recent[0]!.t < sample.t - 180)
      this.recent.shift();
    const storey = this.cfg.floorHeight;
    const quiet = Math.abs(this.v) < this.cfg.quietSpeed;
    this.quietFor = quiet ? this.quietFor + dt : 0;

    if (this.movingSince === null) {
      if (!quiet && Math.abs(delta) > 0.12 * storey) {
        this.movingSince = sample.t - 2;
        this.steppingTime = this.movingTime = 0;
      } else if (Math.abs(delta) < 0.3 * storey) {
        // Level: follow the weather slowly.
        this.ref = ref + delta * (1 - Math.exp(-dt / this.cfg.driftSeconds));
        this.offLevelFor = 0;
      } else {
        // Off level but not moving (a mezzanine, a pressure step that stayed): accept it in time.
        this.offLevelFor += dt;
        if (this.offLevelFor > this.cfg.staleSeconds) {
          this.ref = this.h;
          this.offLevelFor = 0;
        }
      }
      return null;
    }

    // A change is in progress.
    this.movingTime += dt;
    if (sample.stepping) this.steppingTime += dt;
    if (this.quietFor < this.cfg.settleSeconds) return null;
    // Level again: decide what happened.
    const duration = Math.max(0.5, sample.t - this.movingSince - this.quietFor);
    const stepShare = this.movingTime ? this.steppingTime / this.movingTime : 0;
    const startedAt = this.movingSince;
    this.movingSince = null;
    this.offLevelFor = 0;
    if (Math.abs(delta) < this.cfg.threshold * storey) {
      // Less than a floor: a landing pause keeps the reference (the climb may continue); a small
      // wobble is absorbed by the drift tracking above.
      return null;
    }
    // How long the change itself took, from 20% to 80% of it.
    const since = this.recent.filter((r) => r.t >= startedAt - 4);
    const cross = (share: number) =>
      since.find((r) => r.level * Math.sign(delta) >= share * Math.abs(delta))
        ?.t ?? sample.t;
    const rise = cross(0.8) - cross(0.2);
    this.ref = this.h;
    // The stored levels were against the old reference.
    this.recent = [];
    if (rise < this.cfg.minRiseSeconds) return null; // a pressure step, not a person
    const exact = delta / storey;
    const floors = Math.round(exact) || Math.sign(exact);
    // Speed over the middle of the change (20% to 80%), free of the smoothing lag at both ends.
    const meanSpeed = (0.6 * Math.abs(delta)) / Math.max(0.5, rise);
    const via: FloorChangeEvent['via'] =
      stepShare > 0.5
        ? 'stairs'
        : meanSpeed > 0.6
          ? 'lift'
          : stepShare < 0.2 && meanSpeed > 0.2
            ? 'escalator'
            : 'unknown';
    return {
      t: sample.t,
      floors,
      deltaMetres: delta,
      durationSeconds: duration,
      via,
      // 1 when the change is a whole number of storeys, 0.4 when it is half way between two.
      confidence: Math.max(0.4, 1 - 1.2 * Math.abs(exact - Math.round(exact))),
    };
  }
}

export type BeliefFloor = { id: string; level: number };
export type FloorEstimate = {
  floorId: string;
  probability: number;
  /** Every floor's probability, in the order given. */
  all: { floorId: string; probability: number }[];
};

/**
 * A probability for every floor. Sources update it independently:
 *
 * - `moved` (barometer): the whole belief shifts by the storeys measured, with some weight left
 *   on one storey more or fewer.
 * - `heard` (beacons): floors whose strongest beacon is much weaker than the strongest overall
 *   lose weight.
 * - `expected` (route): a mild pull towards the floor the route goes to, used at stairs and lifts.
 * - `confirmed` (the walker said so, or a code was scanned): near certainty.
 */
export class FloorBelief {
  private readonly floors: BeliefFloor[];
  private p: number[];

  constructor(floors: BeliefFloor[], startFloorId?: string, certainty = 0.9) {
    this.floors = [...floors].sort((a, b) => a.level - b.level);
    const n = this.floors.length;
    const start = this.floors.findIndex((f) => f.id === startFloorId);
    this.p =
      start < 0 || n === 1
        ? this.floors.map(() => 1 / n)
        : this.floors.map((_, i) =>
            i === start ? certainty : (1 - certainty) / (n - 1),
          );
  }

  private normalise() {
    const sum = this.p.reduce((s, x) => s + x, 0) || 1;
    // Never fully rule a floor out: evidence must be able to bring it back.
    this.p = this.p.map((x) => Math.max(1e-4, x / sum));
    const again = this.p.reduce((s, x) => s + x, 0);
    this.p = this.p.map((x) => x / again);
  }

  /** The barometer measured a move of `floors` storeys (signed) with this confidence (0–1). */
  moved(floors: number, confidence = 0.85) {
    const n = this.p.length;
    const c = Math.max(0.3, Math.min(0.97, confidence));
    const kernel = new Map<number, number>([[floors, c]]);
    // What is left goes to "one fewer" (towards staying) and "one more".
    kernel.set(
      floors - Math.sign(floors),
      (kernel.get(floors - Math.sign(floors)) ?? 0) + (1 - c) * 0.65,
    );
    kernel.set(
      floors + Math.sign(floors),
      (kernel.get(floors + Math.sign(floors)) ?? 0) + (1 - c) * 0.35,
    );
    const next = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++)
      for (const [shift, w] of kernel) {
        // A move past the top or bottom of the building ends on the last floor.
        const j = Math.max(0, Math.min(n - 1, i + shift));
        next[j] = next[j]! + this.p[i]! * w;
      }
    this.p = next;
    this.normalise();
  }

  /**
   * Beacons heard in the last second or two. `strength` tempers repeated evidence (0–1 per call;
   * about 0.5 at one call a second).
   */
  heard(readings: { floorId: string; rssi: number }[], strength = 0.5) {
    const best = new Map<string, number>();
    for (const r of readings)
      best.set(r.floorId, Math.max(best.get(r.floorId) ?? -Infinity, r.rssi));
    const top = Math.max(...best.values(), -Infinity);
    // Too faint to say which side of a slab the phone is on.
    if (!Number.isFinite(top) || top < -88) return;
    this.p = this.p.map((p, i) => {
      const s = best.get(this.floors[i]!.id) ?? -100;
      const likelihood = Math.max(0.02, Math.exp((s - top) / 6));
      return p * Math.pow(likelihood, strength);
    });
    this.normalise();
  }

  /** The route goes to this floor from here (the walker is at stairs or a lift). */
  expected(floorId: string, strength = 0.25) {
    const i = this.floors.findIndex((f) => f.id === floorId);
    if (i < 0) return;
    this.p = this.p.map((p, j) => p * (j === i ? 1 + strength : 1));
    this.normalise();
  }

  /** The walker confirmed the floor, or scanned a location code on it. */
  confirmed(floorId: string) {
    const i = this.floors.findIndex((f) => f.id === floorId);
    if (i < 0) return;
    const n = this.p.length;
    this.p = this.p.map((_, j) =>
      j === i ? 0.97 : n > 1 ? 0.03 / (n - 1) : 0,
    );
    this.normalise();
  }

  estimate(): FloorEstimate {
    let best = 0;
    for (let i = 1; i < this.p.length; i++)
      if (this.p[i]! > this.p[best]!) best = i;
    return {
      floorId: this.floors[best]!.id,
      probability: this.p[best]!,
      all: this.floors.map((f, i) => ({
        floorId: f.id,
        probability: this.p[i]!,
      })),
    };
  }
}

/**
 * The floor to show: changes only when another floor is clearly more likely (hysteresis), so a
 * moment of doubt does not flip the map back and forth.
 */
export function shownFloor(
  current: string,
  estimate: FloorEstimate,
  switchAt = 0.8,
): { floorId: string; ask: boolean } {
  if (estimate.floorId === current) return { floorId: current, ask: false };
  if (estimate.probability >= switchAt)
    return { floorId: estimate.floorId, ask: false };
  // Another floor leads but not clearly: stay, and let the app ask the walker.
  return { floorId: current, ask: estimate.probability >= 0.5 };
}

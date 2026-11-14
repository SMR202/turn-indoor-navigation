/**
 * Map-aware particle-filter fusion (ADR-0009).
 *
 * Fuses (1) pedestrian dead-reckoning displacements, (2) BLE RSSI as probabilistic range
 * measurements to beacons at known map positions (a robust, multi-hypothesis form of
 * trilateration), (3) discrete position fixes (proximity events, fingerprint matches, QR) and
 * (4) the floor plan (particles cannot cross walls or leave walkable space).
 * Each particle also carries a heading-bias and step-scale state, so persistent drift the
 * walking sensors cannot see is estimated and corrected by the radio/map evidence.
 *
 * Pure and deterministic for a given seed. Coordinates are venue metres (x right, y up).
 */
export type FusionPoint = { x: number; y: number };
export type FusionMap = {
  floorId: string;
  walls: { from: FusionPoint; to: FusionPoint }[];
  /** Union of these polygons is where a person can be. */
  walkable: FusionPoint[][];
  /** Walk graph (room centres, doors, corridor points): walkable paths for displaying moves. */
  graph?: {
    nodes: (FusionPoint & { id: string })[];
    edges: { from: string; to: string }[];
  };
};
export type FusionBeacon = {
  tag: string;
  x: number;
  y: number;
  /** RSSI (dBm) at 1 m, measured with the scanning phone. */
  refRssi: number;
  /** Path-loss exponent; free space is 2, indoors usually 2–3.5. */
  exponent: number;
};
export type FusionConfig = {
  particles: number;
  seed: number;
  /** Relative step-length noise per displacement. */
  stepNoise: number;
  /** Heading noise (rad) per sqrt(metre) of travel. */
  headingNoise: number;
  /** Heading-bias random walk (rad) per metre of travel. */
  biasWalk: number;
  /** Step-scale random walk per metre of travel. */
  scaleWalk: number;
  /** RSSI residual scale (dB) and Student-t degrees of freedom (heavy tails for body shadowing). */
  rssiSigmaDb: number;
  studentDf: number;
  /** Exponent (0-1] applied to each radio update; below 1 discounts correlated, repeated evidence. */
  rssiTemper: number;
  /** Skip a radio update when even the best hypothesis is off by more than this many sigmas per reading. */
  rssiGateSigmas: number;
  /** Ignore readings weaker than this (dBm): too near the noise floor to carry range information. */
  minRssi: number;
  /**
   * Prior spread (dB) of an offset shared by every reading of one update: this phone's antenna gain
   * against the calibrating phone's, a hand or body over the phone. Each hypothesis is scored with
   * its best such offset (Gaussian prior, marginalised), so the shape of the readings across
   * beacons decides the position rather than their absolute level. Infinity = off.
   */
  rssiOffsetSigmaDb: number;
  /**
   * Expected value of that offset (dB) for this phone, from its device profile (ADR-0015): the
   * prior is centred here instead of at zero.
   */
  rssiOffsetPriorDb: number;
  /** Resample when the effective sample size drops below this fraction of N. */
  essFraction: number;
  /** Let a step blocked by a wall continue at a small angle along it (people follow walls). */
  wallSlide: boolean;
};
export const DEFAULT_FUSION_CONFIG: FusionConfig = {
  particles: 500,
  seed: 1,
  stepNoise: 0.1,
  headingNoise: 0.03,
  biasWalk: 0.012,
  scaleWalk: 0.012,
  rssiSigmaDb: 6,
  studentDf: 4,
  rssiTemper: 1,
  rssiGateSigmas: Infinity,
  minRssi: -92,
  rssiOffsetSigmaDb: Infinity,
  rssiOffsetPriorDb: 0,
  essFraction: 0.5,
  wallSlide: true,
};
export type FusionEstimate = {
  x: number;
  y: number;
  /** RMS horizontal spread of the particle cloud (metres) - an uncertainty indicator, not a calibrated confidence interval. */
  sigmaMetres: number;
  /** Effective sample size / N, 1 = healthy, near 0 = degenerate. */
  essFraction: number;
  /** Circular mean of the heading corrections (rad): true heading = walking-sensor heading + this. */
  headingBiasRad: number;
  /** Circular spread of the heading corrections (rad); large while the heading is still unknown. */
  headingBiasSpread: number;
  stepScale: number;
  /**
   * Weight (0–1) of a second hypothesis that is not reported: the walker facing the opposite way
   * at the start. 0 once the evidence has settled it.
   */
  alternativeWeight: number;
  /** The reported hypothesis is the "started facing the other way" one. */
  flipped: boolean;
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function cross(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
) {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}
function segmentsIntersect(
  a: FusionPoint,
  b: FusionPoint,
  c: FusionPoint,
  d: FusionPoint,
) {
  const d1 = cross(a.x, a.y, b.x, b.y, c.x, c.y);
  const d2 = cross(a.x, a.y, b.x, b.y, d.x, d.y);
  const d3 = cross(c.x, c.y, d.x, d.y, a.x, a.y);
  const d4 = cross(c.x, c.y, d.x, d.y, b.x, b.y);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
function inPolygon(x: number, y: number, polygon: FusionPoint[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i]!,
      pj = polygon[j]!;
    if (
      pi.y > y !== pj.y > y &&
      x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x
    )
      inside = !inside;
  }
  return inside;
}

/** Angles tried, in order, when a step would cross a wall (rad): 20°, 40°, 60°. */
const SLIDE_TURNS = [0.35, -0.35, 0.7, -0.7, 1.05, -1.05];
const SLIDE_SIGMA = 0.45;

function distanceToPolyline(x: number, y: number, path: FusionPoint[]) {
  let best = Infinity;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i]!,
      b = path[i + 1]!;
    const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const t =
      l2 === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / l2,
            ),
          );
    best = Math.min(
      best,
      Math.hypot(x - (a.x + t * (b.x - a.x)), y - (a.y + t * (b.y - a.y))),
    );
  }
  return best;
}

/** Heading-bias limit for a start heading uncertainty: ±1 rad, or a full circle when unknown. */
function limitFor(biasSigma: number) {
  return biasSigma >= 1 ? Math.PI : 1;
}

export class ParticleFusion {
  readonly n: number;
  private x: Float64Array;
  private y: Float64Array;
  private bias: Float64Array;
  private scale: Float64Array;
  /**
   * Which start hypothesis a particle descends from: 0 as told, 1 facing the opposite way.
   * A walk that starts 180° wrong cannot be bent back by small heading corrections; a second
   * family of particles can simply win (Plan 005 §7.2).
   */
  private mode: Uint8Array;
  private activeMode = 0;
  /** Metres walked since the opposite-way family was created; it is dropped after a while. */
  private ambiguousMetres = 0;
  /** Extra heading noise while the compass is disturbed (1 = calm). */
  private headingNoiseFactor = 1;
  /** The shared RSSI offset that best explained the last radio update, and how many readings. */
  lastOffset: { db: number; readings: number } | null = null;
  private w: Float64Array;
  private rand: () => number;
  private spare: number | null = null;
  private readonly beacons = new Map<string, FusionBeacon>();
  private bounds: { minX: number; maxX: number; minY: number; maxY: number };
  readonly config: FusionConfig;
  private resampled = 0;
  /** How far a heading correction may drift (rad); a full circle when the start heading is unknown. */
  private biasLimit = 1;

  constructor(
    private readonly map: FusionMap,
    beacons: FusionBeacon[],
    config: Partial<FusionConfig> = {},
  ) {
    this.config = { ...DEFAULT_FUSION_CONFIG, ...config };
    this.n = this.config.particles;
    this.x = new Float64Array(this.n);
    this.y = new Float64Array(this.n);
    this.bias = new Float64Array(this.n);
    this.scale = new Float64Array(this.n).fill(1);
    this.mode = new Uint8Array(this.n);
    this.w = new Float64Array(this.n).fill(1 / this.n);
    this.rand = mulberry32(this.config.seed);
    for (const b of beacons) this.beacons.set(b.tag, b);
    const xs = map.walkable.flat().map((p) => p.x);
    const ys = map.walkable.flat().map((p) => p.y);
    this.bounds = {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }

  private randn() {
    if (this.spare !== null) {
      const s = this.spare;
      this.spare = null;
      return s;
    }
    let u = 0;
    while (u === 0) u = this.rand();
    const v = this.rand();
    const r = Math.sqrt(-2 * Math.log(u));
    this.spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  }
  private walkable(x: number, y: number) {
    return this.map.walkable.some((p) => inPolygon(x, y, p));
  }
  private crossesWall(ax: number, ay: number, bx: number, by: number) {
    const a = { x: ax, y: ay },
      b = { x: bx, y: by };
    return this.map.walls.some((w) => segmentsIntersect(a, b, w.from, w.to));
  }

  /**
   * Start from a known position with Gaussian uncertainty (QR, confirmed fingerprint, user tap).
   * `flipShare` (0–0.5) of the particles start as "the walker faces the opposite way": used when
   * the start heading is an assumption (the route's direction) or a compass reading, not when the
   * walker marked it.
   */
  reset(x: number, y: number, sigma = 0.8, biasSigma = 0.1, flipShare = 0) {
    this.biasLimit = limitFor(biasSigma);
    // A full-circle start already covers every direction.
    const flipped =
      this.biasLimit >= Math.PI
        ? 0
        : Math.round(this.n * Math.max(0, Math.min(0.5, flipShare)));
    this.activeMode = 0;
    this.ambiguousMetres = 0;
    for (let i = 0; i < this.n; i++) {
      this.placeNear(i, x, y, sigma);
      // Spread the flipped family evenly through the array.
      const flip =
        flipped > 0 &&
        Math.floor(((i + 1) * flipped) / this.n) >
          Math.floor((i * flipped) / this.n);
      this.mode[i] = flip ? 1 : 0;
      this.bias[i] = (flip ? Math.PI : 0) + this.randn() * biasSigma;
      this.scale[i] = 1 + this.randn() * 0.05;
    }
  }
  /** How much less the heading is trusted right now (1 calm … 4 heavy magnetic disturbance). */
  setHeadingNoiseFactor(factor: number) {
    this.headingNoiseFactor = Math.max(1, Math.min(4, factor));
  }
  /** Widens every hypothesis's heading by a random amount (rad): the compass start was doubtful. */
  spreadHeading(sigma: number) {
    if (!(sigma > 0)) return;
    for (let i = 0; i < this.n; i++)
      this.bias[i] = this.clampBias(
        this.bias[i]! + this.randn() * sigma,
        this.mode[i]!,
      );
  }
  /**
   * A trusted correction of where the walker is (a tap on the map): positions restart around it,
   * but each hypothesis keeps its learned heading bias and stride scale.
   */
  relocate(x: number, y: number, sigma = 0.8) {
    for (let i = 0; i < this.n; i++) this.placeNear(i, x, y, sigma);
  }
  /** Gaussian around (x, y), in walkable space and on the same side of every wall. */
  private placeNear(i: number, x: number, y: number, sigma: number) {
    let px = x,
      py = y;
    for (let tries = 0; tries < 20; tries++) {
      px = x + this.randn() * sigma;
      py = y + this.randn() * sigma;
      if (this.walkable(px, py) && !this.crossesWall(x, y, px, py)) break;
      px = x;
      py = y;
    }
    this.x[i] = px;
    this.y[i] = py;
    this.w[i] = 1 / this.n;
  }

  /**
   * Start without a known position: spread particles over walkable space and weight them by the
   * beacon readings. Returns false when there is too little evidence to localize.
   */
  initFromRssi(
    readings: { tag: string; rssi: number }[],
    sigmaFloor = 1.5,
    biasSigma = 0.15,
  ): boolean {
    const usable = readings.filter(
      (r) => this.beacons.has(r.tag) && r.rssi >= this.config.minRssi,
    );
    if (usable.length === 0) return false;
    const { minX, maxX, minY, maxY } = this.bounds;
    for (let i = 0; i < this.n; i++) {
      let px = 0,
        py = 0;
      for (let t = 0; t < 200; t++) {
        px = minX + this.rand() * (maxX - minX);
        py = minY + this.rand() * (maxY - minY);
        if (this.walkable(px, py)) break;
      }
      this.x[i] = px;
      this.y[i] = py;
      this.bias[i] = this.randn() * biasSigma;
      this.scale[i] = 1 + this.randn() * 0.05;
      this.w[i] = 1 / this.n;
      this.mode[i] = 0;
    }
    this.activeMode = 0;
    this.biasLimit = limitFor(biasSigma);
    this.updateRssi(usable);
    // One more resampling pass spreads out the survivors a little (roughening).
    this.resample(sigmaFloor * 0.3);
    return true;
  }

  /** Apply a PDR displacement (venue metres, in the PDR frame). */
  predict(dx: number, dy: number) {
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) return;
    const base = Math.atan2(dy, dx);
    const { stepNoise, scaleWalk } = this.config;
    const headingNoise = this.config.headingNoise * this.headingNoiseFactor;
    const biasWalk = this.config.biasWalk * this.headingNoiseFactor;
    const sq = Math.sqrt(len);
    this.ambiguousMetres += len;
    for (let i = 0; i < this.n; i++) {
      this.bias[i] = this.clampBias(
        this.bias[i]! + this.randn() * biasWalk * len,
        this.mode[i]!,
      );
      this.scale[i] = Math.max(
        0.6,
        Math.min(1.5, this.scale[i]! + this.randn() * scaleWalk * len),
      );
      const heading = base + this.bias[i]! + this.randn() * headingNoise * sq;
      const l = Math.max(
        0,
        len * this.scale[i]! * (1 + this.randn() * stepNoise),
      );
      if (this.tryMove(i, heading, l)) continue;
      if (!this.config.wallSlide) {
        this.w[i] = this.w[i]! * 0.02;
        continue;
      }
      // Blocked by a wall: people do not walk through walls, they follow them. Try the step at a
      // small angle to the wall (shorter by the cosine), cheaper the smaller the angle, and let
      // the particle's heading bias learn some of the turn (map-aided heading correction).
      let slid = false;
      const flip = this.rand() < 0.5 ? 1 : -1;
      for (const turn of SLIDE_TURNS) {
        const d = turn * flip;
        const l2 = l * Math.cos(d);
        if (l2 < 0.05 || !this.tryMove(i, heading + d, l2)) continue;
        this.w[i] =
          this.w[i]! * Math.exp(-(d * d) / (2 * SLIDE_SIGMA * SLIDE_SIGMA));
        this.bias[i] = this.clampBias(this.bias[i]! + 0.25 * d, this.mode[i]!);
        slid = true;
        break;
      }
      // Nowhere to go: stay put and lose most of the weight.
      if (!slid) this.w[i] = this.w[i]! * 0.02;
    }
    this.normalize();
    this.settleAmbiguity();
    this.maybeResample();
  }
  /** Keeps a heading correction within its limit, around 0 or around the opposite direction. */
  private clampBias(b: number, mode = 0) {
    if (this.biasLimit >= Math.PI) return Math.atan2(Math.sin(b), Math.cos(b));
    const centre = mode ? Math.PI : 0;
    const off = Math.atan2(Math.sin(b - centre), Math.cos(b - centre));
    return centre + Math.max(-this.biasLimit, Math.min(this.biasLimit, off));
  }
  /** Total weight of the opposite-way family. */
  private flippedWeight() {
    let w = 0;
    for (let i = 0; i < this.n; i++) if (this.mode[i]) w += this.w[i]!;
    return w;
  }
  /**
   * Decides between the two start hypotheses: the reported one changes only on a clear majority
   * (so it cannot flap), and a family that is still the minority after 25 m of walking is dropped.
   */
  private settleAmbiguity() {
    const flipped = this.flippedWeight();
    if (flipped <= 0 || flipped >= 1) {
      if (flipped >= 1) this.activeMode = 1;
      return;
    }
    if (this.activeMode === 0 && flipped > 0.62) this.activeMode = 1;
    else if (this.activeMode === 1 && flipped < 0.38) this.activeMode = 0;
    const minority = this.activeMode === 1 ? 1 - flipped : flipped;
    if (minority < 0.02 || this.ambiguousMetres > 25) {
      // Settled: the losing family goes; its particles are replaced at the next resampling.
      const lose = this.activeMode === 1 ? 0 : 1;
      for (let i = 0; i < this.n; i++) if (this.mode[i] === lose) this.w[i] = 0;
      this.normalize();
      this.resample(0.12);
    }
  }
  private tryMove(i: number, heading: number, l: number) {
    const nx = this.x[i]! + l * Math.cos(heading);
    const ny = this.y[i]! + l * Math.sin(heading);
    if (
      this.crossesWall(this.x[i]!, this.y[i]!, nx, ny) ||
      !this.walkable(nx, ny)
    )
      return false;
    this.x[i] = nx;
    this.y[i] = ny;
    return true;
  }

  /**
   * Soft prior towards a polyline (the route being followed): particles far from it lose some
   * weight, never more than `floor` of it, so a walker who really leaves the route is still found.
   */
  weightByPath(path: FusionPoint[], sigma = 4, floor = 0.3) {
    if (path.length < 2) return;
    const logw = new Float64Array(this.n);
    const lf = Math.log(floor);
    for (let i = 0; i < this.n; i++) {
      const d = distanceToPolyline(this.x[i]!, this.y[i]!, path);
      logw[i] = Math.max(lf, -(d * d) / (2 * sigma * sigma));
    }
    // "People follow the route" must not decide which way the walker set off: while both start
    // hypotheses are alive, the pull acts inside each family and their shares stay as they were.
    const before = this.flippedWeight();
    if (before > 0 && before < 1) {
      for (let i = 0; i < this.n; i++)
        this.w[i] = this.w[i]! * Math.exp(logw[i]!);
      const after = this.flippedWeight();
      let rest = 0;
      for (let i = 0; i < this.n; i++) if (!this.mode[i]) rest += this.w[i]!;
      for (let i = 0; i < this.n; i++)
        this.w[i] = this.mode[i]
          ? after > 0
            ? (this.w[i]! / after) * before
            : 0
          : rest > 0
            ? (this.w[i]! / rest) * (1 - before)
            : 0;
      this.normalize();
      this.maybeResample();
      return;
    }
    this.applyLogWeights(logw);
  }

  private usable(readings: { tag: string; rssi: number }[]) {
    return readings.filter(
      (r) =>
        this.beacons.has(r.tag) &&
        r.rssi >= this.config.minRssi &&
        Number.isFinite(r.rssi),
    );
  }
  /**
   * How well a point explains the readings (log-likelihood, heavy-tailed), with the best shared
   * offset for that point: a phone-and-body level shift c ~ N(prior, offsetSigma²). Its best value
   * given the residuals is a shrunk mean, so one reading alone keeps most of its range information.
   */
  private fitAt(px: number, py: number, used: { tag: string; rssi: number }[]) {
    const {
      rssiSigmaDb: sigma,
      studentDf: df,
      rssiOffsetSigmaDb: offsetSigma,
      rssiOffsetPriorDb: prior,
    } = this.config;
    const shrink = Number.isFinite(offsetSigma)
      ? (sigma * sigma) / (offsetSigma * offsetSigma)
      : null;
    let sum = 0;
    const residuals = new Array<number>(used.length);
    for (let j = 0; j < used.length; j++) {
      const r = used[j]!;
      const b = this.beacons.get(r.tag)!;
      const d = Math.max(0.5, Math.hypot(px - b.x, py - b.y));
      residuals[j] = r.rssi - (b.refRssi - 10 * b.exponent * Math.log10(d));
      sum += residuals[j]!;
    }
    const offset =
      shrink === null ? 0 : (sum + shrink * prior) / (used.length + shrink);
    let ll =
      shrink === null
        ? 0
        : -((offset - prior) * (offset - prior)) /
          (2 * offsetSigma * offsetSigma);
    for (let j = 0; j < used.length; j++) {
      const residual = residuals[j]! - offset;
      ll +=
        (-(df + 1) / 2) *
        Math.log(1 + (residual * residual) / (df * sigma * sigma));
    }
    return { ll, offset };
  }
  /** How well the best hypothesis explained the latest readings (log-likelihood). */
  lastRssiFit: number | null = null;
  private lattice: FusionPoint[] | null = null;
  /**
   * How well the best spot anywhere on the floor would explain the readings. When that is much
   * better than what the cloud manages, update after update, the cloud is in the wrong place.
   */
  bestFitOnFloor(readings: { tag: string; rssi: number }[]): number | null {
    const used = this.usable(readings);
    if (used.length < 2) return null;
    if (!this.lattice) {
      const { minX, maxX, minY, maxY } = this.bounds;
      const step = Math.max(
        1,
        Math.sqrt(((maxX - minX) * (maxY - minY)) / 400),
      );
      this.lattice = [];
      for (let x = minX + step / 2; x < maxX; x += step)
        for (let y = minY + step / 2; y < maxY; y += step)
          if (this.walkable(x, y)) this.lattice.push({ x, y });
    }
    let best = -Infinity;
    for (const q of this.lattice)
      best = Math.max(best, this.fitAt(q.x, q.y, used).ll);
    return Number.isFinite(best) ? best : null;
  }

  /** Probabilistic multilateration: weight particles by how well they explain the RSSI readings. */
  updateRssi(readings: { tag: string; rssi: number }[]): boolean {
    const {
      rssiSigmaDb: sigma,
      studentDf: df,
      rssiTemper,
      rssiGateSigmas,
    } = this.config;
    const used = this.usable(readings);
    if (used.length === 0) return false;
    const logw = new Float64Array(this.n);
    let best = -Infinity;
    let bestOffset = 0;
    for (let i = 0; i < this.n; i++) {
      const fit = this.fitAt(this.x[i]!, this.y[i]!, used);
      logw[i] = fit.ll;
      if (fit.ll > best) {
        best = fit.ll;
        bestOffset = fit.offset;
      }
    }
    this.lastRssiFit = best;
    this.lastOffset = { db: bestOffset, readings: used.length };
    // Innovation gate: when no hypothesis explains the readings (shadowed body, moved beacon),
    // the readings are the outlier, not the position.
    if (Number.isFinite(rssiGateSigmas)) {
      const g = rssiGateSigmas * sigma;
      const gate =
        used.length *
        (-(df + 1) / 2) *
        Math.log(1 + (g * g) / (df * sigma * sigma));
      if (best < gate) return false;
    }
    if (rssiTemper !== 1)
      for (let i = 0; i < this.n; i++) logw[i] = logw[i]! * rssiTemper;
    this.applyLogWeights(logw);
    return true;
  }

  /**
   * The readings keep contradicting every hypothesis: then the position is wrong, not the
   * readings (the walker was carried somewhere else by a lift, a missed floor, a long pause in
   * the pocket). Part of the cloud is spread over the whole floor again and the readings choose,
   * so a correct cloud survives and a wrong one is replaced. Heading and stride are kept.
   */
  recoverFromRssi(
    readings: { tag: string; rssi: number }[],
    share = 0.5,
    /** How many contradicted updates led here: the readings count that many times over. */
    strength = 1,
  ): boolean {
    const used = this.usable(readings);
    if (used.length < 2) return false;
    const replace = Math.round(this.n * Math.max(0.1, Math.min(0.9, share)));
    const { minX, maxX, minY, maxY } = this.bounds;
    for (let i = 0; i < this.n; i++) {
      this.w[i] = 1 / this.n;
      const fresh =
        Math.floor(((i + 1) * replace) / this.n) >
        Math.floor((i * replace) / this.n);
      if (!fresh) continue;
      for (let t = 0; t < 200; t++) {
        const px = minX + this.rand() * (maxX - minX);
        const py = minY + this.rand() * (maxY - minY);
        if (!this.walkable(px, py)) continue;
        this.x[i] = px;
        this.y[i] = py;
        break;
      }
      // Heading and stride come from a hypothesis that walked this far.
      const donor = Math.floor(this.rand() * this.n);
      this.bias[i] = this.bias[donor]!;
      this.scale[i] = this.scale[donor]!;
      this.mode[i] = this.mode[donor]!;
    }
    const logw = new Float64Array(this.n);
    const k = Math.max(1, strength);
    for (let i = 0; i < this.n; i++)
      logw[i] = k * this.fitAt(this.x[i]!, this.y[i]!, used).ll;
    this.applyLogWeights(logw);
    this.resample(0.4);
    return true;
  }

  /**
   * Nearest-beacon evidence: the walker is close to (x, y) and, since its signal clearly beats
   * every other beacon's, probably on the same side of the walls (the same room). Each wall between
   * a hypothesis and the beacon multiplies its weight by `wallFactor`. When no hypothesis is within
   * about two sigmas of the beacon on its side of the walls, the cloud restarts spread over the
   * beacon's room (not on the beacon itself), keeping heading and stride.
   */
  updateNear(x: number, y: number, sigma: number, wallFactor = 0.35) {
    const logw = new Float64Array(this.n);
    const lf = Math.log(wallFactor);
    const b = { x, y };
    let best = -Infinity;
    for (let i = 0; i < this.n; i++) {
      const px = this.x[i]!,
        py = this.y[i]!;
      const d2 = (px - x) ** 2 + (py - y) ** 2;
      let walls = 0;
      for (const w of this.map.walls)
        if (segmentsIntersect(b, { x: px, y: py }, w.from, w.to)) walls++;
      logw[i] = -d2 / (2 * sigma * sigma) + walls * lf;
      best = Math.max(best, logw[i]!);
    }
    if (best < -2.2) {
      this.relocate(x, y, sigma);
      return;
    }
    this.applyLogWeights(logw);
  }

  /** Gaussian position fix (proximity event, fingerprint match, tap, QR). */
  updatePosition(x: number, y: number, sigma: number) {
    const logw = new Float64Array(this.n);
    let best = -Infinity;
    for (let i = 0; i < this.n; i++) {
      const d2 = (this.x[i]! - x) ** 2 + (this.y[i]! - y) ** 2;
      logw[i] = -d2 / (2 * sigma * sigma);
      best = Math.max(best, logw[i]!);
    }
    // If the fix contradicts the whole cloud, trust the fix: restart around it.
    if (best < -12) {
      this.reset(x, y, sigma, 0.12);
      return;
    }
    this.applyLogWeights(logw);
  }

  private applyLogWeights(logw: Float64Array) {
    let max = -Infinity;
    for (let i = 0; i < this.n; i++) {
      const v = Math.log(Math.max(this.w[i]!, 1e-300)) + logw[i]!;
      logw[i] = v;
      if (v > max) max = v;
    }
    let sum = 0;
    for (let i = 0; i < this.n; i++) {
      // Floor keeps a diversity of hypotheses alive when the evidence is inconsistent.
      this.w[i] = Math.max(Math.exp(logw[i]! - max), 1e-9);
      sum += this.w[i]!;
    }
    for (let i = 0; i < this.n; i++) this.w[i] = this.w[i]! / sum;
    this.settleAmbiguity();
    this.maybeResample();
  }
  private normalize() {
    let sum = 0;
    for (let i = 0; i < this.n; i++) sum += this.w[i]!;
    if (sum <= 0 || !Number.isFinite(sum)) {
      this.w.fill(1 / this.n);
      return;
    }
    for (let i = 0; i < this.n; i++) this.w[i] = this.w[i]! / sum;
  }
  private ess() {
    let s = 0;
    for (let i = 0; i < this.n; i++) s += this.w[i]! * this.w[i]!;
    return 1 / s / this.n;
  }
  private maybeResample() {
    if (this.ess() < this.config.essFraction) this.resample(0.12);
  }
  private resample(jitter: number) {
    const nx = new Float64Array(this.n),
      ny = new Float64Array(this.n),
      nb = new Float64Array(this.n),
      ns = new Float64Array(this.n);
    const nm = new Uint8Array(this.n);
    const step = 1 / this.n;
    let u = this.rand() * step;
    let c = this.w[0]!;
    let i = 0;
    for (let k = 0; k < this.n; k++) {
      while (u > c && i < this.n - 1) {
        i++;
        c += this.w[i]!;
      }
      let px = this.x[i]!,
        py = this.y[i]!;
      if (jitter > 0) {
        const jx = px + this.randn() * jitter,
          jy = py + this.randn() * jitter;
        if (this.walkable(jx, jy) && !this.crossesWall(px, py, jx, jy)) {
          px = jx;
          py = jy;
        }
      }
      nx[k] = px;
      ny[k] = py;
      nb[k] = this.bias[i]! + (jitter > 0 ? this.randn() * 0.01 : 0);
      ns[k] = this.scale[i]!;
      nm[k] = this.mode[i]!;
      u += step;
    }
    this.x = nx;
    this.y = ny;
    this.bias = nb;
    this.scale = ns;
    this.mode = nm;
    this.w.fill(1 / this.n);
    this.resampled++;
  }

  estimate(): FusionEstimate {
    // With two start hypotheses alive, report the leading one: their average is a place nobody is.
    const flipped = this.flippedWeight();
    const split = flipped > 0 && flipped < 1;
    const active = this.activeMode;
    const share = split ? (active === 1 ? flipped : 1 - flipped) : 1;
    const use = (i: number) =>
      split ? (this.mode[i] === active ? this.w[i]! / share : 0) : this.w[i]!;
    let mx = 0,
      my = 0,
      bs = 0,
      bc = 0,
      ms = 0;
    for (let i = 0; i < this.n; i++) {
      const w = use(i);
      if (w === 0) continue;
      mx += w * this.x[i]!;
      my += w * this.y[i]!;
      bs += w * Math.sin(this.bias[i]!);
      bc += w * Math.cos(this.bias[i]!);
      ms += w * this.scale[i]!;
    }
    const mb = Math.atan2(bs, bc);
    const concentration = Math.min(1, Math.hypot(bs, bc));
    // Report a particle, not the mean, when the mean falls outside walkable space (multi-modal cloud).
    if (!this.walkable(mx, my)) {
      let best = 0,
        bd = Infinity;
      for (let i = 0; i < this.n; i++) {
        if (use(i) === 0) continue;
        const d = (this.x[i]! - mx) ** 2 + (this.y[i]! - my) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      mx = this.x[best]!;
      my = this.y[best]!;
    }
    let v = 0;
    for (let i = 0; i < this.n; i++)
      v += use(i) * ((this.x[i]! - mx) ** 2 + (this.y[i]! - my) ** 2);
    return {
      x: mx,
      y: my,
      sigmaMetres: Math.sqrt(v),
      essFraction: this.ess(),
      headingBiasRad: mb,
      headingBiasSpread: Math.sqrt(
        -2 * Math.log(Math.max(1e-9, concentration)),
      ),
      stepScale: ms,
      alternativeWeight: split ? 1 - share : 0,
      flipped: split ? active === 1 : flipped >= 1,
    };
  }
  /** Number of resampling events so far (diagnostic). */
  /** Every hypothesis with its normalised weight (copies; for summaries such as room belief). */
  weightedPoints(): { x: number; y: number; w: number }[] {
    const flipped = this.flippedWeight();
    const split = flipped > 0 && flipped < 1;
    let total = 0;
    for (let i = 0; i < this.n; i++)
      if (!split || this.mode[i] === this.activeMode) total += this.w[i]!;
    const out: { x: number; y: number; w: number }[] = [];
    for (let i = 0; i < this.n; i++)
      if (!split || this.mode[i] === this.activeMode)
        out.push({
          x: this.x[i]!,
          y: this.y[i]!,
          w: this.w[i]! / (total || 1),
        });
    return out;
  }

  get resamples() {
    return this.resampled;
  }
}

/** Log-distance path-loss RSSI prediction used by the measurement model (exposed for calibration and tests). */
export function predictRssi(
  b: Pick<FusionBeacon, 'refRssi' | 'exponent'>,
  distanceMetres: number,
) {
  return (
    b.refRssi - 10 * b.exponent * Math.log10(Math.max(0.5, distanceMetres))
  );
}

/** Path-loss exponent from the 1 m reference and one reading at a known distance (>= 2 m). */
export function exponentFromReading(
  refRssi: number,
  rssiAtDistance: number,
  distanceMetres: number,
) {
  if (distanceMetres < 2) return undefined;
  const n = (refRssi - rssiAtDistance) / (10 * Math.log10(distanceMetres));
  return Number.isFinite(n) ? Math.max(1.6, Math.min(3.8, n)) : undefined;
}

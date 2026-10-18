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
  /** Resample when the effective sample size drops below this fraction of N. */
  essFraction: number;
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
  essFraction: 0.5,
};
export type FusionEstimate = {
  x: number;
  y: number;
  /** RMS horizontal spread of the particle cloud (metres) - an uncertainty indicator, not a calibrated confidence interval. */
  sigmaMetres: number;
  /** Effective sample size / N, 1 = healthy, near 0 = degenerate. */
  essFraction: number;
  headingBiasRad: number;
  stepScale: number;
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

export class ParticleFusion {
  readonly n: number;
  private x: Float64Array;
  private y: Float64Array;
  private bias: Float64Array;
  private scale: Float64Array;
  private w: Float64Array;
  private rand: () => number;
  private spare: number | null = null;
  private readonly beacons = new Map<string, FusionBeacon>();
  private bounds: { minX: number; maxX: number; minY: number; maxY: number };
  readonly config: FusionConfig;
  private resampled = 0;

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

  /** Start from a known position with Gaussian uncertainty (QR, confirmed fingerprint, user tap). */
  reset(x: number, y: number, sigma = 0.8, biasSigma = 0.1) {
    for (let i = 0; i < this.n; i++) {
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
      this.bias[i] = this.randn() * biasSigma;
      this.scale[i] = 1 + this.randn() * 0.05;
      this.w[i] = 1 / this.n;
    }
  }

  /**
   * Start without a known position: spread particles over walkable space and weight them by the
   * beacon readings. Returns false when there is too little evidence to localize.
   */
  initFromRssi(
    readings: { tag: string; rssi: number }[],
    sigmaFloor = 1.5,
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
      this.bias[i] = this.randn() * 0.15;
      this.scale[i] = 1 + this.randn() * 0.05;
      this.w[i] = 1 / this.n;
    }
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
    const { stepNoise, headingNoise, biasWalk, scaleWalk } = this.config;
    const sq = Math.sqrt(len);
    for (let i = 0; i < this.n; i++) {
      this.bias[i] = Math.max(
        -1,
        Math.min(1, this.bias[i]! + this.randn() * biasWalk * len),
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
      const nx = this.x[i]! + l * Math.cos(heading);
      const ny = this.y[i]! + l * Math.sin(heading);
      if (
        this.crossesWall(this.x[i]!, this.y[i]!, nx, ny) ||
        !this.walkable(nx, ny)
      ) {
        // Blocked by the map: stay put and lose most of the weight.
        this.w[i] = this.w[i]! * 0.02;
      } else {
        this.x[i] = nx;
        this.y[i] = ny;
      }
    }
    this.normalize();
    this.maybeResample();
  }

  /** Probabilistic multilateration: weight particles by how well they explain the RSSI readings. */
  updateRssi(readings: { tag: string; rssi: number }[]): boolean {
    const {
      rssiSigmaDb: sigma,
      studentDf: df,
      minRssi,
      rssiTemper,
      rssiGateSigmas,
    } = this.config;
    const used = readings.filter(
      (r) =>
        this.beacons.has(r.tag) && r.rssi >= minRssi && Number.isFinite(r.rssi),
    );
    if (used.length === 0) return false;
    const logw = new Float64Array(this.n);
    let best = -Infinity;
    for (let i = 0; i < this.n; i++) {
      let ll = 0;
      for (const r of used) {
        const b = this.beacons.get(r.tag)!;
        const d = Math.max(0.5, Math.hypot(this.x[i]! - b.x, this.y[i]! - b.y));
        const predicted = b.refRssi - 10 * b.exponent * Math.log10(d);
        const residual = r.rssi - predicted;
        ll +=
          (-(df + 1) / 2) *
          Math.log(1 + (residual * residual) / (df * sigma * sigma));
      }
      logw[i] = ll;
      if (ll > best) best = ll;
    }
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
      u += step;
    }
    this.x = nx;
    this.y = ny;
    this.bias = nb;
    this.scale = ns;
    this.w.fill(1 / this.n);
    this.resampled++;
  }

  estimate(): FusionEstimate {
    let mx = 0,
      my = 0,
      mb = 0,
      ms = 0;
    for (let i = 0; i < this.n; i++) {
      mx += this.w[i]! * this.x[i]!;
      my += this.w[i]! * this.y[i]!;
      mb += this.w[i]! * this.bias[i]!;
      ms += this.w[i]! * this.scale[i]!;
    }
    // Report a particle, not the mean, when the mean falls outside walkable space (multi-modal cloud).
    if (!this.walkable(mx, my)) {
      let best = 0,
        bd = Infinity;
      for (let i = 0; i < this.n; i++) {
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
      v += this.w[i]! * ((this.x[i]! - mx) ** 2 + (this.y[i]! - my) ** 2);
    return {
      x: mx,
      y: my,
      sigmaMetres: Math.sqrt(v),
      essFraction: this.ess(),
      headingBiasRad: mb,
      stepScale: ms,
    };
  }
  /** Number of resampling events so far (diagnostic). */
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

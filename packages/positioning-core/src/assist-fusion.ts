import {
  DEFAULT_PROXIMITY_CONFIG,
  ProximityDetector,
  type BeaconPlacement,
  type ProximityEvent,
} from './ble-proximity';
import {
  ParticleFusion,
  type FusionBeacon,
  type FusionConfig,
  type FusionEstimate,
  type FusionMap,
} from './fusion';

/**
 * Live/replay positioning policy shared by the phone tracker and offline replay (ADR-0010).
 * It decides WHEN evidence is applied, which is where the first home tests failed:
 * radio was applied every second as independent evidence, proximity fired with one beacon heard,
 * and the estimate moved while the user stood still.
 */
export const ASSIST_REVISION = 'assist-v2' as const;
export type AssistConfig = {
  windowSeconds: number;
  minPackets: number;
  /** Radio evidence is applied at most this often. */
  radioIntervalSeconds: number;
  /** ...and only after this much walking since the last radio update (no drifting while standing). */
  minMoveForRadioMetres: number;
  /** Radio updates allowed right after a cold start without walking, to settle the first fix. */
  settleRadioUpdates: number;
  proximitySigmaMetres: number;
  /** A proximity fix needs at least this many beacons heard (one beacon alone cannot separate near from loud). */
  proximityMinBeacons: number;
  /** Reported uncertainty never claims better than this. */
  displaySigmaFloorMetres: number;
  defaultExponent: number;
  /** Route prior while navigating: Gaussian width (metres, 0 = off) and least weight kept far away. */
  routePriorSigmaMetres: number;
  routePriorFloor: number;
  fusion: Partial<FusionConfig>;
};
export const DEFAULT_ASSIST_CONFIG: AssistConfig = {
  windowSeconds: 2.5,
  minPackets: 3,
  radioIntervalSeconds: 3,
  minMoveForRadioMetres: 1,
  settleRadioUpdates: 3,
  proximitySigmaMetres: 2.5,
  proximityMinBeacons: 2,
  displaySigmaFloorMetres: 1.5,
  defaultExponent: 2.3,
  routePriorSigmaMetres: 2.5,
  routePriorFloor: 0.15,
  fusion: { rssiSigmaDb: 9, rssiTemper: 0.6, rssiGateSigmas: 2.5 },
};
export type AssistEstimate = FusionEstimate & {
  beaconsUsed: number;
  source: 'beacons' | 'fix' | 'walking';
  /** Uncertainty for display: the particle spread, floored so the app never overclaims. */
  displaySigmaMetres: number;
};
export type AssistProximity = ProximityEvent & {
  before: { x: number; y: number };
  beacon: { floorId: string; x: number; y: number };
};

function median(values: number[]) {
  const v = [...values].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

export class AssistFusion {
  readonly fusion: ParticleFusion;
  readonly config: AssistConfig;
  private readonly placements: BeaconPlacement[];
  private readonly detector: ProximityDetector | null;
  private readonly recent = new Map<string, { at: number; rssi: number }[]>();
  private lastRaw: { x: number; y: number } | null = null;
  private positioned = false;
  private lastRadio = -Infinity;
  private movedSinceRadio = 0;
  private settleLeft = 0;
  private current: AssistEstimate | null = null;
  private lastUsed = 0;

  constructor(
    map: FusionMap,
    placements: BeaconPlacement[],
    config: Partial<AssistConfig> = {},
    seed = 1,
  ) {
    this.config = {
      ...DEFAULT_ASSIST_CONFIG,
      ...config,
      fusion: { ...DEFAULT_ASSIST_CONFIG.fusion, ...config.fusion },
    };
    this.placements = placements.filter(
      (b) => b.floorId === map.floorId && b.referenceRssi !== undefined,
    );
    const beacons: FusionBeacon[] = this.placements.map((b) => ({
      tag: b.tag,
      x: b.x,
      y: b.y,
      refRssi: b.referenceRssi!,
      exponent: b.exponent ?? this.config.defaultExponent,
    }));
    this.fusion = new ParticleFusion(map, beacons, {
      ...this.config.fusion,
      seed,
    });
    this.detector = this.placements.length
      ? new ProximityDetector(this.placements, DEFAULT_PROXIMITY_CONFIG)
      : null;
  }

  get beaconCount() {
    return this.placements.length;
  }
  get hasPosition() {
    return this.positioned;
  }
  estimate() {
    return this.current;
  }

  addSample(at: number, tag: string, rssi: number) {
    if (!Number.isFinite(rssi)) return;
    const list = this.recent.get(tag) ?? [];
    list.push({ at, rssi });
    if (list.length > 400) list.splice(0, list.length - 400);
    this.recent.set(tag, list);
    this.detector?.push({ t: at, tag, rssi });
  }
  readings(at: number) {
    const out: { tag: string; rssi: number }[] = [];
    for (const [tag, list] of this.recent) {
      const fresh = list.filter(
        (s) => s.at >= at - this.config.windowSeconds && s.at <= at,
      );
      if (fresh.length >= this.config.minPackets)
        out.push({ tag, rssi: median(fresh.map((s) => s.rssi)) });
    }
    return out;
  }
  health(at: number) {
    return this.placements.map((b) => {
      const list = this.recent.get(b.tag);
      const last = list?.at(-1);
      return {
        tag: b.tag,
        silentSeconds: last ? at - last.at : null,
        rssi:
          list && list.length
            ? median(list.slice(-8).map((s) => s.rssi))
            : null,
      };
    });
  }

  private publish(source: AssistEstimate['source']) {
    if (!this.positioned) return null;
    const e = this.fusion.estimate();
    this.current = {
      ...e,
      beaconsUsed: this.lastUsed,
      source,
      displaySigmaMetres: Math.max(
        this.config.displaySigmaFloorMetres,
        e.sigmaMetres,
      ),
    };
    return this.current;
  }

  /** Cold start from beacons alone; false when fewer than two beacons are heard. */
  locate(at: number) {
    const r = this.readings(at);
    if (r.length < 2 || !this.fusion.initFromRssi(r)) return false;
    this.positioned = true;
    this.lastUsed = r.length;
    this.settleLeft = this.config.settleRadioUpdates;
    this.lastRadio = at;
    this.publish('beacons');
    return true;
  }
  /**
   * Trusted position (tap, QR, confirmed fingerprint). `headingSigma` (rad) is how unsure the
   * walking heading is: small when the walker faced a known direction, large when they did not,
   * so the map can settle it in the first metres.
   */
  setPosition(x: number, y: number, sigma = 1.2, headingSigma = 0.1) {
    this.fusion.reset(x, y, sigma, headingSigma);
    this.sinceRoutePrior = 0;
    this.positioned = true;
    this.settleLeft = 0;
    this.movedSinceRadio = 0;
    this.publish('fix');
  }
  /** The walker corrected their position (tap): keeps the learned heading and stride. */
  relocate(x: number, y: number, sigma = 1.2) {
    if (!this.positioned) return this.setPosition(x, y, sigma);
    this.fusion.relocate(x, y, sigma);
    this.sinceRoutePrior = 0;
    this.publish('fix');
  }
  /** Measured position (fingerprint candidate). */
  fixPosition(x: number, y: number, sigma: number) {
    if (!this.positioned) return this.setPosition(x, y, sigma);
    this.fusion.updatePosition(x, y, sigma);
    this.publish('fix');
  }
  syncRaw(x: number, y: number) {
    this.lastRaw = { x, y };
  }
  private route: { x: number; y: number }[] | null = null;
  private sinceRoutePrior = 0;
  /**
   * The route being followed (or null). People navigating mostly walk along it, so after every
   * couple of metres the filter gets a gentle, floored pull towards it - never a constraint.
   */
  setRoute(route: { x: number; y: number }[] | null) {
    this.route = route && route.length > 1 ? route : null;
  }
  /** Raw walking position (any frame); only displacements are used. */
  walk(x: number, y: number) {
    const prev = this.lastRaw;
    this.lastRaw = { x, y };
    if (!prev || !this.positioned) return false;
    const dx = x - prev.x,
      dy = y - prev.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.02) return false;
    this.movedSinceRadio += len;
    this.fusion.predict(dx, dy);
    this.sinceRoutePrior += len;
    if (
      this.route &&
      this.config.routePriorSigmaMetres > 0 &&
      this.sinceRoutePrior >= 2
    ) {
      this.fusion.weightByPath(
        this.route,
        this.config.routePriorSigmaMetres,
        this.config.routePriorFloor,
      );
      this.sinceRoutePrior = 0;
    }
    this.publish('walking');
    return true;
  }

  /** Periodic evidence step (about once per second). */
  tick(at: number): {
    radioApplied: boolean;
    proximity: AssistProximity | null;
  } {
    const r = this.readings(at);
    let radioApplied = false;
    if (
      this.positioned &&
      r.length &&
      at - this.lastRadio >= this.config.radioIntervalSeconds &&
      (this.movedSinceRadio >= this.config.minMoveForRadioMetres ||
        this.settleLeft > 0)
    ) {
      radioApplied = this.fusion.updateRssi(r);
      this.lastRadio = at;
      this.movedSinceRadio = 0;
      if (this.settleLeft > 0) this.settleLeft--;
      this.lastUsed = r.length;
    }
    let proximity: AssistProximity | null = null;
    const event = this.detector?.evaluate(at) ?? null;
    if (
      event &&
      this.positioned &&
      r.length >= this.config.proximityMinBeacons &&
      event.marginDb !== null
    ) {
      const b = this.placements.find((p) => p.tag === event.tag)!;
      const before = this.fusion.estimate();
      this.fusion.updatePosition(b.x, b.y, this.config.proximitySigmaMetres);
      proximity = {
        ...event,
        before: { x: before.x, y: before.y },
        beacon: { floorId: b.floorId, x: b.x, y: b.y },
      };
    }
    if (radioApplied || proximity) this.publish('beacons');
    return { radioApplied, proximity };
  }
}

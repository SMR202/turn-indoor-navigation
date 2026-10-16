import {
  BLE_PROXIMITY_REVISION,
  DEFAULT_PROXIMITY_CONFIG,
  ParticleFusion,
  ProximityDetector,
  bleTraceRecordSchema,
  type BeaconPlacementSet,
  type BleTraceRecord,
  type FusionBeacon,
  type FusionEstimate,
  type FusionMap,
} from '@turn/positioning-core';
import { startBeaconStream, type StreamSample } from '../fingerprinting/ble';
import { saveBleTrace } from '../fingerprinting/storage';

export const DEFAULT_EXPONENT = 2.3;
const WINDOW_SECONDS = 2;
const MIN_PACKETS = 3;
const TICK_MS = 1000;
const MAX_SAMPLES = 60000;

export type BeaconHealth = {
  tag: string;
  /** Seconds since the last packet, null if never heard this session. */
  silentSeconds: number | null;
  rssi: number | null;
};
export type TrackerEstimate = FusionEstimate & {
  /** Beacons contributing to the latest measurement update. */
  beaconsUsed: number;
  source: 'beacons' | 'fix' | 'walking';
};

type Clock = () => number;
export type TrackerOptions = {
  floorId: string;
  map: FusionMap;
  placements: BeaconPlacementSet | null;
  platform: 'ios' | 'android';
  navigationSessionId?: string;
  start?: typeof startBeaconStream;
  now?: Clock;
  save?: (trace: BleTraceRecord) => void;
  seed?: number;
};

function median(values: number[]) {
  const v = [...values].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

/**
 * Live positioning controller (ADR-0009): runs the beacon stream, the particle filter, proximity
 * fixes and the trace recorder. Outside React; the screen only subscribes to its estimates.
 */
export class AssistedTracker {
  readonly fusion: ParticleFusion;
  private readonly beacons: FusionBeacon[];
  private readonly detector: ProximityDetector | null;
  private readonly recent = new Map<string, { at: number; rssi: number }[]>();
  private readonly samples: StreamSample[] = [];
  private readonly pdrLog: { t: number; x: number; y: number }[] = [];
  private readonly fusedLog: {
    t: number;
    x: number;
    y: number;
    sigma: number;
  }[] = [];
  private readonly events: BleTraceRecord['events'] = [];
  private listeners = new Set<(e: TrackerEstimate | null) => void>();
  private stopStream: (() => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;
  private startedIso = '';
  private dropped = 0;
  private lastRaw: { x: number; y: number } | null = null;
  private current: TrackerEstimate | null = null;
  private hasPosition = false;
  private failure: string | null = null;
  private finished = false;
  private started = false;
  private lastFusedLog = -Infinity;
  private lastWalk = -Infinity;
  private quietUpdates = 0;

  constructor(private readonly options: TrackerOptions) {
    const placed = (options.placements?.beacons ?? []).filter(
      (b) => b.floorId === options.floorId && b.referenceRssi !== undefined,
    );
    this.beacons = placed.map((b) => ({
      tag: b.tag,
      x: b.x,
      y: b.y,
      refRssi: b.referenceRssi!,
      exponent: b.exponent ?? DEFAULT_EXPONENT,
    }));
    this.fusion = new ParticleFusion(options.map, this.beacons, {
      seed: options.seed ?? 1,
    });
    this.detector = placed.length
      ? new ProximityDetector(placed, DEFAULT_PROXIMITY_CONFIG)
      : null;
  }

  get beaconCount() {
    return this.beacons.length;
  }
  get positioned() {
    return this.hasPosition;
  }
  get streamFailure() {
    return this.failure;
  }
  private clock() {
    return (
      (this.options.now ?? (() => performance.now()))() / 1000 - this.startedAt
    );
  }

  /** Starts the beacon stream. Safe to call without placements: walking + map fusion still works. */
  async begin() {
    if (this.started) return;
    this.started = true;
    this.startedAt = (this.options.now ?? (() => performance.now()))() / 1000;
    this.startedIso = new Date().toISOString();
    if (this.beacons.length === 0) return;
    const start = this.options.start ?? startBeaconStream;
    this.stopStream = await start(
      (batch, drop) => {
        this.dropped += drop;
        const at = this.clock();
        for (const s of batch) {
          if (this.samples.length < MAX_SAMPLES) this.samples.push(s);
          else this.dropped++;
          const list = this.recent.get(s.tag) ?? [];
          list.push({ at, rssi: s.rssi });
          this.recent.set(s.tag, list);
          this.detector?.push({ t: at, tag: s.tag, rssi: s.rssi });
        }
      },
      (message) => {
        this.failure = message;
      },
    );
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  subscribe(listener: (e: TrackerEstimate | null) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private publish(source: TrackerEstimate['source'], beaconsUsed: number) {
    if (!this.hasPosition) return;
    this.current = { ...this.fusion.estimate(), beaconsUsed, source };
    const t = this.clock();
    if (t - this.lastFusedLog >= 1 && this.fusedLog.length < 20000) {
      this.lastFusedLog = t;
      this.fusedLog.push({
        t,
        x: this.current.x,
        y: this.current.y,
        sigma: this.current.sigmaMetres,
      });
    }
    for (const l of this.listeners) l(this.current);
  }
  estimate() {
    return this.current;
  }

  /** Current smoothed beacon readings keyed by tag (used for the initial position search). */
  private windowReadings() {
    const now = this.clock();
    const out: { tag: string; rssi: number }[] = [];
    for (const [tag, list] of this.recent) {
      while (list.length && list[0]!.at < now - WINDOW_SECONDS) list.shift();
      if (list.length >= MIN_PACKETS)
        out.push({ tag, rssi: median(list.map((s) => s.rssi)) });
    }
    return out;
  }

  private tick() {
    if (this.finished) return;
    const readings = this.windowReadings();
    const now = this.clock();
    // Re-applying the same evidence while standing still would make the cloud falsely certain.
    if (now - this.lastWalk < 6) this.quietUpdates = 0;
    if (this.hasPosition && readings.length && this.quietUpdates < 4) {
      this.fusion.updateRssi(readings);
      if (now - this.lastWalk >= 6) this.quietUpdates++;
    }
    const event = this.detector?.evaluate(now) ?? null;
    if (event) {
      const placement = this.options.placements?.beacons.find(
        (b) => b.tag === event.tag,
      );
      if (placement && this.hasPosition) {
        const before = this.fusion.estimate();
        // Proximity is a strong but not absolute statement: ~1.6 m, never a hard reset.
        this.fusion.updatePosition(placement.x, placement.y, 1.6);
        this.events.push({
          ...event,
          estimate: { floorId: this.options.floorId, x: before.x, y: before.y },
          beacon: {
            floorId: placement.floorId,
            x: placement.x,
            y: placement.y,
          },
          discrepancyMetres: Math.hypot(
            before.x - placement.x,
            before.y - placement.y,
          ),
        });
      }
    }
    this.publish('beacons', readings.length);
  }

  /**
   * Finds a starting position from beacon readings alone. Waits for the signal window to fill
   * (default 6 s) and returns null when too few beacons were heard.
   */
  async locate(waitMs = 6000): Promise<TrackerEstimate | null> {
    await new Promise((r) => setTimeout(r, waitMs));
    const readings = this.windowReadings();
    if (readings.length < 2 || !this.fusion.initFromRssi(readings)) return null;
    this.hasPosition = true;
    this.lastRaw = null;
    this.publish('beacons', readings.length);
    return this.current;
  }

  /** A trusted position: user tap, QR, confirmed fingerprint, known anchor. */
  setPosition(x: number, y: number, sigma = 1) {
    this.fusion.reset(x, y, sigma);
    this.hasPosition = true;
    this.publish('fix', this.windowReadings().length);
  }
  /** A measured position (fingerprint candidate): blends with the current belief. */
  fixPosition(x: number, y: number, sigma: number) {
    if (!this.hasPosition) return this.setPosition(x, y, sigma);
    this.fusion.updatePosition(x, y, sigma);
    this.publish('fix', this.windowReadings().length);
  }

  /** Sets the walking-sensor reference point; later displacements are deltas from it. */
  syncRaw(x: number, y: number) {
    this.lastRaw = { x, y };
  }
  /** Feed the raw PDR position each time it changes. */
  walk(x: number, y: number) {
    const prev = this.lastRaw;
    this.lastRaw = { x, y };
    const t = this.clock();
    if (this.pdrLog.length < 20000) this.pdrLog.push({ t, x, y });
    if (!prev || !this.hasPosition) return;
    const dx = x - prev.x,
      dy = y - prev.y;
    if (Math.hypot(dx, dy) < 0.02) return;
    this.lastWalk = t;
    this.fusion.predict(dx, dy);
    this.publish('walking', this.current?.beaconsUsed ?? 0);
  }

  health(): BeaconHealth[] {
    const now = this.clock();
    return this.beacons.map((b) => {
      const list = this.recent.get(b.tag);
      const last = list?.at(-1);
      return {
        tag: b.tag,
        silentSeconds: last ? now - last.at : null,
        rssi:
          list && list.length
            ? median(list.slice(-8).map((s) => s.rssi))
            : null,
      };
    });
  }

  /** Stops the stream and saves the assisted-navigation trace (null when nothing was recorded). */
  finish(): BleTraceRecord | null {
    if (this.finished) return null;
    this.finished = true;
    if (this.timer) clearInterval(this.timer);
    this.stopStream?.();
    if (
      !this.options.placements ||
      this.fusedLog.length + this.samples.length === 0
    )
      return null;
    const parsed = bleTraceRecordSchema.safeParse({
      kind: 'ble-trace',
      schemaVersion: 1,
      sessionId: `ble-trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      detectorRevision: BLE_PROXIMITY_REVISION,
      mode: 'assist',
      ...(this.options.navigationSessionId
        ? { navigationSessionId: this.options.navigationSessionId }
        : {}),
      startedAt: this.startedIso || new Date().toISOString(),
      platform: this.options.platform,
      placements: this.options.placements,
      config: DEFAULT_PROXIMITY_CONFIG,
      samples: this.samples,
      events: this.events,
      droppedSamples: this.dropped,
      pdr: this.pdrLog,
      fused: this.fusedLog,
    });
    if (!parsed.success) return null;
    (this.options.save ?? saveBleTrace)(parsed.data);
    return parsed.data;
  }
}
